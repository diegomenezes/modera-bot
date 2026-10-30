-- O admin só administra. Remove as contas que só têm admins como membros
-- e o vínculo de admins com qualquer conta de cliente.
DELETE FROM "Workspace" w
WHERE EXISTS (
  SELECT 1 FROM "Membership" m JOIN "user" u ON u."id" = m."userId"
  WHERE m."workspaceId" = w."id" AND u."role" = 'admin'
)
AND NOT EXISTS (
  SELECT 1 FROM "Membership" m JOIN "user" u ON u."id" = m."userId"
  WHERE m."workspaceId" = w."id" AND (u."role" IS NULL OR u."role" <> 'admin')
);

DELETE FROM "Membership" m
USING "user" u
WHERE u."id" = m."userId" AND u."role" = 'admin';
