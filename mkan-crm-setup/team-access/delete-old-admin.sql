-- Hard-delete the old account osmanabdout@hotmail.com (userId 9e2ac2b5-794e-4222-bc8f-676f861f3c5d).
-- Safe order (roleTarget has no cascade from userWorkspace, so delete it explicitly first):
--   1) role assignments for osman's memberships
--   2) workspaceMember profiles in each of the 4 workspace schemas
--      (cascades timelineActivity; created-by pointers on records SET NULL)
--   3) the core.user row -> CASCADES appToken, keyValuePair, userWorkspace
--      (userWorkspace cascade -> agentChatThread, navigationMenuItem, twoFactorAuthenticationMethod;
--       view.createdBy SET NULL)
-- Precondition: abdout@databayt.org is Admin in all 4 workspaces (already applied).

-- 1) role assignments (no FK cascade)
DELETE FROM core."roleTarget"
WHERE "userWorkspaceId" IN (
  SELECT id FROM core."userWorkspace" WHERE "userId" = '9e2ac2b5-794e-4222-bc8f-676f861f3c5d'
);

-- 2) per-workspace member profiles
DELETE FROM workspace_42oj8oexbj9f2weuevgy4wq57."workspaceMember" WHERE "userId" = '9e2ac2b5-794e-4222-bc8f-676f861f3c5d'; -- Mkan
DELETE FROM workspace_cth4d39nbagwniv0w1fjcgtnq."workspaceMember" WHERE "userId" = '9e2ac2b5-794e-4222-bc8f-676f861f3c5d'; -- Hogwarts
DELETE FROM workspace_49xiz3vugal08hzgbasq64s1q."workspaceMember" WHERE "userId" = '9e2ac2b5-794e-4222-bc8f-676f861f3c5d'; -- Sijillee
DELETE FROM workspace_bx5ohvep01fxpsl2fryy3ohbx."workspaceMember" WHERE "userId" = '9e2ac2b5-794e-4222-bc8f-676f861f3c5d'; -- Moallimee

-- 3) the global user (cascades tokens, kv pairs, memberships)
DELETE FROM core."user" WHERE id = '9e2ac2b5-794e-4222-bc8f-676f861f3c5d';
