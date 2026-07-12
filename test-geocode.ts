import { geocodeBatch, geocode } from './lib/geocode'; async function test() { const result = await geocodeBatch([{ address: 'מושב קלחים' }]); console.log('Batch Result:', result); } test();
