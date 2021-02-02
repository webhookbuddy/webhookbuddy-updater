import { Webhook, KeyValue } from 'schema/types';
import { useEffect } from 'react';
import useForwardingIds from './useForwardingIds';
import useForwardUrls from './useForwardUrls';
import useReadWebhook from './useReadWebhook';
import { useMe } from 'context/user-context';
import {
  AddForward_addForward_webhook,
  AddForward_addForward_webhook_forwards,
} from './types/AddForward';
import useAddForward from './useAddForward';

const { ipcRenderer } = window.require('electron');

const queryString = (query: KeyValue[]) =>
  query
    .map(pair => `${pair.key}=${encodeURIComponent(pair.value)}`)
    .join('&');

const appendQuery = (url: string, query: KeyValue[]) =>
  !query.length
    ? url
    : url.includes('?')
    ? `${url}&${queryString(query)}`
    : `${url}?${queryString(query)}`;

const mapHeaders = (rawHeaders: string[]) => {
  const headers = [];
  for (let i = 0; i < rawHeaders?.length ?? []; i = i + 2)
    headers.push({
      __typename: 'KeyValue',
      key: rawHeaders[i],
      value: rawHeaders[i + 1],
    } as KeyValue);

  return headers;
};

const extractContentType = (headers: KeyValue[]) =>
  headers.find(header => header.key.toLowerCase() === 'content-type')
    ?.value ?? null;

const useForwarder = (endpointId: string) => {
  const me = useMe();
  const { addForwardingIds, removeForwardingId } = useForwardingIds();
  const { addForwardUrl } = useForwardUrls(endpointId);
  const { addForward } = useAddForward();
  const { readWebhook } = useReadWebhook();

  useEffect(() => {
    const onForwardedListener = (
      _: any,
      {
        metadata,
        rawHeaders,
        statusCode,
        data,
        error,
      }: {
        metadata: {
          url: string;
          webhook: AddForward_addForward_webhook;
        };
        statusCode: number;
        rawHeaders: string[];
        data: string;
        error: any;
      },
    ) => {
      const forward = {
        __typename: 'Forward',
        id: '_' + Math.round(Math.random() * 1000000),
        url: metadata.url,
        statusCode: error ? 502 : statusCode,
        success: statusCode >= 200 && statusCode < 300,
        createdAt: new Date(),
        method: metadata.webhook.method,
        headers: mapHeaders(rawHeaders),
        query: metadata.webhook.query,
        contentType: extractContentType(mapHeaders(rawHeaders)),
        body: data ?? '',
        user: me,
      } as AddForward_addForward_webhook_forwards;

      removeForwardingId(metadata.webhook.id);

      addForward({
        variables: {
          input: {
            webhookId: metadata.webhook.id,
            url: forward.url,
            method: forward.method,
            statusCode: forward.statusCode,
            // need to remap here b/c server rejects __typename property
            headers: forward.headers.map(kv => ({
              key: kv.key,
              value: kv.value,
            })),
            // need to remap here b/c server rejects __typename property
            query: forward.query.map(kv => ({
              key: kv.key,
              value: kv.value,
            })),
            body: forward.body,
          },
        },
        optimisticResponse: {
          addForward: {
            __typename: 'AddForwardPayload',
            webhook: {
              ...metadata.webhook,
              forwards: [forward, ...metadata.webhook.forwards],
            },
          },
        },
      });
    };

    ipcRenderer.on('http-request-completed', onForwardedListener);

    return () => {
      ipcRenderer.removeListener(
        'http-request-completed',
        onForwardedListener,
      );
    };
  }, [removeForwardingId, addForward, readWebhook, me]);

  const forwardWebhook = (url: string, webhooks: Webhook[]) => {
    addForwardUrl(url);
    addForwardingIds(webhooks.map(w => w.id));
    webhooks
      .sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10))
      .forEach(webhook => {
        ipcRenderer.send('http-request', {
          method: webhook.method,
          url: appendQuery(url, webhook.query),
          headers: webhook.headers
            .filter(header => header.key.toLowerCase() !== 'host')
            .reduce((acc, cur) => {
              acc[cur.key] = cur.value;
              return acc;
            }, {} as any),
          body: webhook.body,
          metadata: {
            url,
            webhook,
          },
        });
      });
  };

  return {
    forwardWebhook,
  };
};

export default useForwarder;
