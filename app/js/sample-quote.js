// The sample quote typed into the original spreadsheet, and loaded by the app's "Sample quote" button.

export const SAMPLE_CUSTOMER = 'Acme Fabrication (sample)';

export const SAMPLE_PARTS = Object.freeze([
  Object.freeze({
    partName: 'Bracket',
    material: 'Mild steel',
    thickness: 3,
    widthMm: 200,
    heightMm: 150,
    cutLengthMm: 900,
    pierces: 4,
    quantity: 1,
  }),
  Object.freeze({
    partName: 'Cover plate',
    material: 'Stainless steel',
    thickness: 1.5,
    widthMm: 400,
    heightMm: 300,
    cutLengthMm: 2400,
    pierces: 12,
    quantity: 25,
  }),
  Object.freeze({
    partName: 'Sign panel',
    material: 'Acrylic',
    thickness: 5,
    widthMm: 600,
    heightMm: 400,
    cutLengthMm: 5200,
    pierces: 30,
    quantity: 200,
  }),
]);
