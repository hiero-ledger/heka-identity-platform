import { Role } from 'common/auth'
import { Auth0Directory } from 'organization-admin/directory/auth0.directory'
import { DirectoryOrganization } from 'organization-admin/directory/directory.types'

/**
 * `Auth0Directory` against a real Auth0 tenant set up by `heka-sso-service/auth0/setup-tenant.sh`, with the
 * `heka-identity-admin` machine-to-machine application (its Management API scopes only).
 *
 * Opt-in, and the fixture is prepared beforehand, because the admin application deliberately cannot create users:
 *   AUTH0_LIVE_URL            https://<tenant>.<region>.auth0.com
 *   AUTH0_LIVE_CLIENT_ID      heka-identity-admin client id
 *   AUTH0_LIVE_CLIENT_SECRET  its secret
 *   AUTH0_LIVE_HEKA_ORG_ID    heka_org_id of an organization (e.g. heka-sso)
 *   AUTH0_LIVE_MEMBER_ID      a member of it (auth0|...) whose membership has the role Issuer
 * The test switches the member to Verifier and back to Issuer.
 */
const url = process.env.AUTH0_LIVE_URL?.replace(/\/+$/, '')
const memberId = process.env.AUTH0_LIVE_MEMBER_ID ?? ''
const hekaOrgId = process.env.AUTH0_LIVE_HEKA_ORG_ID ?? ''

describe.skipIf(!url || !memberId)('Auth0 live: Auth0Directory for delegated organization administration', () => {
  const directory = new Auth0Directory({
    url: url as string,
    clientId: process.env.AUTH0_LIVE_CLIENT_ID ?? '',
    clientSecret: process.env.AUTH0_LIVE_CLIENT_SECRET ?? '',
    orgIdField: 'heka_org_id',
  })
  let organization: DirectoryOrganization

  test('finds the organization by its metadata heka_org_id', async () => {
    organization = (await directory.findOrganization(hekaOrgId)) as DirectoryOrganization

    expect(organization).toMatchObject({ hekaOrgId })
    expect(organization.id).toMatch(/^org_/)
    expect(await directory.findOrganization(`${hekaOrgId}-other`)).toBeUndefined()
  })

  test('lists the member with the role of the membership', async () => {
    const member = (await directory.listMembers(organization)).find((candidate) => candidate.id === memberId)

    expect(member?.roles).toEqual([Role.Issuer])
  })

  test('replaces the membership role, leaving exactly the new one, and back', async () => {
    const member = (await directory.getMember(organization, memberId))!

    await directory.setRole(organization, member, Role.Verifier)
    expect((await directory.getMember(organization, memberId))?.roles).toEqual([Role.Verifier])

    await directory.setRole(organization, { ...member, roles: [Role.Verifier] }, Role.Issuer)
    expect((await directory.getMember(organization, memberId))?.roles).toEqual([Role.Issuer])
  }, 30_000)

  test('does not find a user who is not a member', async () => {
    expect(await directory.getMember(organization, 'auth0|000000000000000000000000')).toBeUndefined()
  })
})
