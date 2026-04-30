---
description: Run TypeScript typecheck on both client and server. Reports results compactly.
---

Run typecheck on both packages in parallel and report:

```bash
cd client && npx tsc --noEmit
cd ../server && npx tsc --noEmit
```

If both pass, say "both green" and the commit count since last green if known.
If either fails, list the failing files + line ranges only — do not paste full error output unless asked.
