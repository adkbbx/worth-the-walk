import { z } from 'zod';
import { FEATURES } from '../src/mailbox.mjs';

const id = z.string().min(1).max(200);
export const latitude = z.number().finite().min(-90).max(90);
export const longitude = z.number().finite().min(-180).max(180);
export const readPageSchema = z.object({
  pageId: id,
  mode: z.enum(['page', 'tiles']).default('tiles'),
  tiles: z.array(z.string().refine(value =>
    Buffer.byteLength(value) <= 2 * 1024 * 1024 &&
    /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) &&
    value.slice(value.indexOf(',') + 1).length % 4 === 0,
  'Tiles must be JPEG or PNG base64 data URLs of at most 2 MB')).min(1).max(9),
}).refine(value => value.mode !== 'page' || value.tiles.length === 1, 'Whole-page mode requires one image');
export const mergeSchema = z.object({
  flyerId: id,
  pages: z.array(z.object({ id, detailed: z.boolean().default(false), tiles: z.array(z.record(z.string(), z.unknown()).nullable()).max(9) })).min(1).max(100),
  scanDate: z.iso.date(),
  home: z.object({ stationId: id, lat: latitude, lon: longitude }).nullable(),
});
const row = z.array(z.number().finite()).length(FEATURES.length);
export const rankSchema = z.object({
  train: z.array(z.object({ row, label: z.union([z.literal(0), z.literal(1)]) })),
  predict: z.array(z.object({ id, row })),
});
export const locateSchema = z.object({
  q: z.string().max(1000).optional(), name: z.string().max(300).optional(),
  phones: z.array(z.string().max(100)).max(5).optional(),
  lat: latitude.optional(), lon: longitude.optional(),
});
