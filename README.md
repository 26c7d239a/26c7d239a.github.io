
## Faster scanning

This version checks up to six folders at the same time instead of waiting for each folder one-by-one. It requests only the Drive fields the viewer needs, avoids server-side sorting, retries temporary rate-limit/server errors, and saves the last successful video index in your browser. On later visits, that saved list appears immediately while a fresh scan checks for updates.

The first scan still needs to ask Google Drive about every folder. Very large or deeply nested libraries may still take time because Google API response times and quota limits remain the bottlenecks. The saved index contains video metadata only, not video files, and is stored in this browser.
