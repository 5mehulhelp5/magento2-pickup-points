# Innosend Pickup Points – Support

## Contact

See the [Integration module support documentation](../../magento2-integration/docs/en/SUPPORT.md) for contact details.

## Before opening a ticket

1. Verify the API Token is valid using **Test API Token Connection** in Integration config.
2. Open the browser console and DevTools network panel, reproduce the issue, and note any errors.
3. Check `var/log/system.log` for backend API errors.

## Diagnostic information to include

| Item | How to retrieve |
|---|---|
| Magento version | `php bin/magento --version` |
| PHP version | `php -v` |
| Module version | `composer show innosend/magento2-pickup-points` |
| Browser + version | Browser → Help → About |
| Network request to `/innosend/ajax/getPickupPoints` | Copy from DevTools → Network → Response |
| Error from `system.log` | `tail -n 100 var/log/system.log` |
| Steps to reproduce | — |

## Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| No pickup points shown | API Token invalid or expired | Test connection in Integration config |
| Empty carrier dropdown (admin) | Token invalid; carrier list cannot be fetched | Fix token, flush cache |
| Map shows but no markers | Pickup points have no coordinates | Innosend API issue; contact Innosend |
| Google Maps warning in console | Missing Map ID | Add Map ID in Pickup Points config |
| Pickup point lost after order | Observer not triggered | Check `fm_innosend_order` table; verify module is enabled |
