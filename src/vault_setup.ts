import { createVault, COLLECTION } from "./matter_vault.ts";

await createVault();
console.log(`collection ${COLLECTION} ready`);
