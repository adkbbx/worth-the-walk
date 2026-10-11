export const TILE_PROMPT = `You are reading ONE part (tile) of ONE page of a Japanese flyer that a resident photographed. Return ONLY one compact JSON object (no prose, no code fences). Use these keys, but leave out any key whose value would be null, false or an empty list; missing keys default automatically:
{"business":{"name":null,"branch":null,"kind":null},"category":"other","summary_en":null,"offers":[],"items":[],"address":null,"phones":[],"websites":[],"hours":null,"valid_from_text":null,"valid_to_text":null,"comes_to_you":false,"delivery":false}
Rules:
- Report only text printed in this tile. If something is cut off or unreadable, use null. Never guess or invent.
- business.name: business or brand name as printed. business.branch: branch name if printed (e.g. 高津店). business.kind: what kind of business, in English (e.g. "aikido dojo").
- category: one of lesson, fitness, cleaning, shop, supermarket, drugstore, restaurant, clinic, event, food_delivery, buying_service, junk_removal, real_estate, official_or_personal, other. Use official_or_personal for bills, tax/insurance/city notices, or anything addressed to a named person.
- summary_en: one short English sentence about what this tile shows, or null.
- offers: promotions. kind: free_trial (無料体験), discount (○円引, ○%OFF), coupon (クーポン), sale (セール, 特売), campaign (キャンペーン), other. text_ja exactly as printed; text_en a short translation; regular_yen = printed normal price (通常, 定価, 通常価格); offer_yen = the offer price; discount_yen = ○円引; percent_off = ○%; deadline_text exactly as printed (e.g. "11月30日(日)まで"). Money as plain numbers.
- items: only for product or service price lists (supermarket, drugstore, menu, cleaning, shop). name_ja as printed; name_en short translation; price_yen = main price (本体価格 if both are shown); price_tax_incl_yen if 税込 is printed; regular_yen and regular_label only when a comparison price is printed for that same item (通常価格, 非会員価格, 非会員・カード払価格, メーカー希望小売価格; when a member price and a non-member price are both shown, price_yen = the member price and regular_yen = the non-member price); unit (100g当たり, 1パック); conditions from: members, cash, card, today_only, limited_quantity, weekend.
- address, phones (EVERY phone number printed anywhere in the tile, including large headline numbers such as 0120-…, 044-…, 090-…; exactly as printed; never copy an example), websites (URLs or domains as printed), hours, valid_from_text, valid_to_text: exactly as printed.
- comes_to_you: true for 出張, 訪問, お伺い, 回収 services that come to the customer's home. delivery: true for 宅配, デリバリー, お届け, 出前.`;

// Keep both passes on the same schema and printed-text rules.
export const PAGE_PROMPT = TILE_PROMPT
  .replace('ONE part (tile) of ONE page', 'ONE whole page')
  .replace('"business":', '"flyer_count":1,"business":')
  .replaceAll('this tile', 'this page')
  .replaceAll('the tile', 'the page') + `
- flyer_count: integer, default 1. How many separate flyers or leaflets are visible in this photo? Count separate leaflets, not panels or coupons on one flyer.
- Read the whole page for its business, category, main offer, headline phone numbers and address. Only report what is printed. If a dense price list is unreadable, omit those items and describe the printed price list in summary_en; never invent items or prices.`;

export const MERGE_PROMPT = `The JSON objects below are whole-page and optional close-up readings of every page of ONE Japanese flyer ("page" is the 0-based page number). Combine them into ONE JSON object with the same keys as a tile reading, except "items" (price-list items are merged separately; do not output them), and add "page" (number) to every offer. Rules: use only information present in the readings; the first reading of each page supplies business identity, headline phones and address; prefer the most complete printed value; keep every distinct phone number; remove duplicate offers that come from overlapping tiles; choose one category from the same list; write summary_en as one sentence of at most 120 characters saying what the business is and what it offers; never invent prices, dates, phone numbers or addresses. Return only JSON.`;
