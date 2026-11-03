import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getOrderByPublicId } from '../../../../../features/orders/db';
import { parseOrderOrLegacyPublicId } from '../../../../../features/ids/publicId';
import { getSecret } from '../../../../../features/secrets/store';
import { getLabelRecord } from '../../../../../features/shipping/labelStore';
import { getShipmondoLabelPdf } from '../../../../../features/shipping/shipmondo';

export const prerender = false;

/** Serve a booked Shipmondo label without exposing API credentials or provider URLs. */
export const GET: APIRoute = async ({ params }) => {
  const publicId = parseOrderOrLegacyPublicId(params.id, 'order');
  const order = publicId ? await getOrderByPublicId(env.DB, publicId) : null;
  if (!order) return new Response('Not found', { status: 404 });

  const record = await getLabelRecord(env.DB, order.id);
  if (!record || record.status !== 'purchased' || record.provider !== 'Shipmondo' || !record.transaction_id) {
    return new Response('No Shipmondo label is recorded for this order.', { status: 404 });
  }

  const username = await getSecret(env.DB, 'shipmondo_api_user');
  const key = await getSecret(env.DB, 'shipmondo_api_key');
  if (!username || !key) return new Response('Shipmondo credentials are not configured.', { status: 503 });

  const result = await getShipmondoLabelPdf(username, key, record.transaction_id);
  if (!result.ok) {
    return new Response(result.error, { status: 502, headers: { 'cache-control': 'private, no-store' } });
  }

  return new Response(result.value.body, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="plus-thirty-order-${order.id}.pdf"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
};
