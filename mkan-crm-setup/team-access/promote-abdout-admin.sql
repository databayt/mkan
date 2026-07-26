-- Promote abdout@databayt.org to full Admin in all 4 workspaces.
-- 1) grant admin-panel + impersonate on the global user
-- 2) switch its per-workspace role from Member -> Admin (4 roleTarget rows)

UPDATE core."user"
SET "canAccessFullAdminPanel" = true, "canImpersonate" = true, "updatedAt" = now()
WHERE email = 'abdout@databayt.org';

WITH abdout AS (
  SELECT id FROM core."user" WHERE email = 'abdout@databayt.org'
),
adminmap(ws, admin_role) AS (
  VALUES
    ('44d2ae41-beba-4ab4-a2b3-ae04a888585b'::uuid, '93ab5e0a-4e57-45ea-a322-1c756155bb0f'::uuid), -- Mkan
    ('d8863cb2-abe1-481b-af60-cb2e1759e226'::uuid, '4e2a5dcd-2dcd-442a-abea-14759fc702d0'::uuid), -- Hogwarts
    ('48397dc7-3cdf-460c-89aa-b97b256114fe'::uuid, '0a72f542-6532-4926-9867-e7c1c89c985a'::uuid), -- Sijillee
    ('c95c60c0-3228-430d-ba4b-eef6a91ff8bd'::uuid, 'e524e9ea-44aa-48e3-ad7c-93a08dfc867a'::uuid)  -- Moallimee
)
UPDATE core."roleTarget" rt
SET "roleId" = am.admin_role, "updatedAt" = now()
FROM adminmap am, core."userWorkspace" uw, abdout a
WHERE rt."workspaceId" = am.ws
  AND rt."userWorkspaceId" = uw.id
  AND uw."userId" = a.id
  AND uw."workspaceId" = am.ws;
