"""Configure a local search instance without changing other Lumen settings."""
import os
from pathlib import Path
import re
import secrets

root=Path(__file__).resolve().parents[1]
backend_env=root/'backend/.env'
text=backend_env.read_text()
search_env=root/'infra/search/.env'
try:
    fd=os.open(search_env,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
except FileExistsError:
    if not re.search(r'^LUMEN_SEARCH_SECRET=.+$',search_env.read_text(),re.M):
        raise SystemExit('The existing search environment has no secret. Check infra/search/.env.')
else:
    with os.fdopen(fd,'w') as handle:handle.write('LUMEN_SEARCH_SECRET='+secrets.token_hex(32)+'\n')
text=re.sub(r'(?m)^WEB_SEARCH_URL=.*\n?','',text)
backend_env.write_text(text.rstrip()+'\nWEB_SEARCH_URL=http://127.0.0.1:8888\n')
print('Local search configured at http://127.0.0.1:8888. Search secret retained privately.')
