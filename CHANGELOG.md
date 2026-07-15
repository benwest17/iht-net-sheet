# Net Sheet Update

## Requested changes

- Buyer net sheets: e-recording / Simplifile fee is $9.50 for mortgage and cash transactions.
- Seller net sheets: removed the redundant Total Commission display row from the on-screen summary and generated report/PDF output.
- Listing Agent Commission and Buyer’s Agent Commission remain unchanged.
- Net proceeds calculations still subtract both individual commission amounts.

## Verification

Each repository includes:

- `npm run test:requested-changes`
- `npm run build`

All four repositories passed both commands before packaging.
