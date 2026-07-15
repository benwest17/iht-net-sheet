# Testing Instructions

1. Extract the ZIP for the repository you want to test.
2. Run `npm install`.
3. Run `npm run test:requested-changes`.
4. Run `npm run dev` and open the local URL shown by Vite.
5. For buyer sheets, confirm the Simplifile e-recording line displays $9.50 for mortgage and cash transactions.
6. For seller sheets, confirm Listing Agent Commission and Buyer’s Agent Commission display, but Total Commission does not.
7. Generate a PDF/report and confirm the same seller commission display behavior.
8. Run `npm run build` before deployment. The completed production files will be in `dist/`.
