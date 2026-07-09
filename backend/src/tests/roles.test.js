const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isAdminRole,
  isSuperAdminRole,
  isProtectedAccount,
  assertCanModifyUser,
} = require('../utils/roles');

describe('roles', () => {
  const sovereign = { role: 'superadmin', email: 'owner@remotelymatch.app', _id: '1' };
  const admin = { role: 'admin', email: 'admin@remotelymatch.app', _id: '2' };
  const user = { role: 'user', email: 'user@remotelymatch.app', _id: '3' };

  it('treats superadmin as admin-capable', () => {
    assert.equal(isAdminRole('superadmin'), true);
    assert.equal(isAdminRole('admin'), true);
    assert.equal(isAdminRole('user'), false);
  });

  it('protects superadmin and sovereign email from regular admins', () => {
    assert.equal(isProtectedAccount(sovereign, 'owner@remotelymatch.app'), true);
    assert.equal(isProtectedAccount({ role: 'admin', email: 'owner@remotelymatch.app' }, 'owner@remotelymatch.app'), true);

    assert.throws(
      () => assertCanModifyUser({ role: 'admin' }, sovereign, 'owner@remotelymatch.app'),
      /Cannot modify super admin/
    );
    assert.doesNotThrow(() => assertCanModifyUser({ role: 'superadmin' }, admin, 'owner@remotelymatch.app'));
    assert.doesNotThrow(() => assertCanModifyUser({ role: 'admin' }, user, 'owner@remotelymatch.app'));
  });

  it('only superadmin can demote admins', () => {
    assert.throws(
      () => assertCanModifyUser({ role: 'admin' }, admin, 'owner@remotelymatch.app', 'demote-admin'),
      /Only super admin can change admin roles/
    );
    assert.doesNotThrow(() =>
      assertCanModifyUser({ role: 'superadmin' }, admin, 'owner@remotelymatch.app', 'demote-admin')
    );
  });
});
