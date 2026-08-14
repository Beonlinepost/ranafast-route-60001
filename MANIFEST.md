# Ranafast Route (Test) — Route 60001 Backup

This package is a read-only export of the live route at https://magheryrt-3b64p5qr.manus.space/route/60001.

## Coverage

The export contains **23 present sections** and **633 stops**. The highest section position is **32**.

Present section positions: 1, 2, 3, 4, 5, 6, 7, 11, 12, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32.

Missing section positions in the live source: 8, 9, 10, 13, 14, 15, 16, 17, 18. These positions are documented but deliberately not invented or filled in.

## Files

- `ranafast_route_60001.json` — complete structured export with metadata, sections, and stops.
- `sections.json` — raw sections payload from the live route API.
- `stops.json` — raw stops payload from the live route API.
- `MANIFEST.md` — this file.

## Included operational data

The stop records retain the fields supplied by the live route, including resident names, aliases, direction, route/box reference, property type, notes, drop-off information, house details, Eircode, ordering, and section association where present.

## Security

This backup contains route data only. It does not contain `.env` files, passwords, OAuth credentials, database connection strings, cookies, API keys, or access tokens.

## Import caution

Do not run this export against a production database without first mapping its schema and taking a separate backup. This package is intended for version control and review.
