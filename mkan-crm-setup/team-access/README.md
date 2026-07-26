# Team Access — shared Twenty instance

Manages team logins across all workspaces on the single multi-workspace Twenty instance
(backend `twenty-api` / `twenty-db-1` Docker container on this host). Four workspaces share
one backend + database, so **one login works across all of them** via the workspace switcher.

## Workspaces

| Workspace | Subdomain | workspaceId | schema |
|-----------|-----------|-------------|--------|
| Mkan | mkan.crm.databayt.org | `44d2ae41-beba-4ab4-a2b3-ae04a888585b` | `workspace_42oj8oexbj9f2weuevgy4wq57` |
| Hogwarts | hogwarts.crm.databayt.org | `d8863cb2-abe1-481b-af60-cb2e1759e226` | `workspace_cth4d39nbagwniv0w1fjcgtnq` |
| Sijillee | sijillee.crm.databayt.org | `48397dc7-3cdf-460c-89aa-b97b256114fe` | `workspace_49xiz3vugal08hzgbasq64s1q` |
| Moallimee | moallimee.crm.databayt.org | `c95c60c0-3228-430d-ba4b-eef6a91ff8bd` | `workspace_bx5ohvep01fxpsl2fryy3ohbx` |

## Current credentials (all workspaces)

Password for everyone: **`12345678`**. Login is by email (Twenty has no username login).

| Person | Email | Role |
|--------|-------|------|
| Abdout | `abdout@databayt.org` | **Admin** |
| Aseel | `aseel@databayt.org` | Member |
| Sedon | `sedon@databayt.org` | Member |
| Moutaz | `moutaz@databayt.org` | Member |
| Ibrahim | `ibrahim@databayt.org` | Member |
| Samia | `samia@databayt.org` | Member |
| Moed | `moed@databayt.org` | Member |

> Member = full record access (create/edit owners, homes, etc.), no settings/data-model/member
> management. Promote anyone to Admin in Settings → Members, or re-run the promote script pattern.

## Scripts (run against `twenty-db-1` on this host)

All default to a **dry run** (transaction rolled back). Add `--commit` to apply.

- `seed-team-members.sql` + `run.sh` — create the 7 members in all 4 workspaces (idempotent).
  - `./run.sh` (dry) · `./run.sh --commit` · `./run.sh --verify`
- `promote-abdout-admin.sql` — grant abdout admin-panel + Admin role in all 4. *(applied)*
- `delete-old-admin.sql` — hard-deleted the former sole admin `osmanabdout@hotmail.com`. *(applied)*

### Change the shared password
Regenerate the bcrypt hash and re-run the seed (updates nothing existing — for new users) or
`UPDATE core."user" SET "passwordHash"=<hash> WHERE email LIKE '%@databayt.org'`:
```
docker exec twenty-server-1 node -e "console.log(require('bcrypt').hashSync('NEWPASS',10))"
```
(Password must be 8–50 chars — Twenty rejects shorter.)

### Add a new member
Add their `(email, First)` to the VALUES list in `seed-team-members.sql` and `./run.sh --commit`.

## What was applied (audit)

1. Seeded 7 users × 4 workspaces = 7 users, 28 memberships, 28 member profiles, 28 Member roles.
2. Promoted `abdout@databayt.org` to Admin (admin-panel + impersonate + Admin role ×4).
3. Hard-deleted `osmanabdout@hotmail.com` (4 role targets, 4 member profiles, 1 user; tokens +
   memberships cascaded). Verified every workspace still has an admin (abdout).

## Notes

- New members' `searchVector` is left NULL (no DB trigger), so they may not appear in *global
  search* until edited once in the UI or a metadata re-sync runs. Login and all record access
  are unaffected.
- Login is verified end-to-end: the stored bcrypt hash validates `12345678` using the server's
  own bcrypt; memberships/roles mirror the working admin.
