const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function loadCloud(){
  const sandbox={window:{},fetch:async()=>{throw new Error('not used')}};
  vm.runInNewContext(fs.readFileSync('assets/cloud.js','utf8'),sandbox);
  return sandbox.window.CloudStore;
}

test('username sign-in maps to an internal non-mailbox identity while email sign-in remains unchanged',async()=>{
  const CloudStore=loadCloud();let credentials;let email='test123@users.invalid';
  const client={
    auth:{
      getUser:async()=>({data:{user:{id:'test-user',email}}}),
      signInWithPassword:async value=>{credentials=value;return {error:null}},
      signOut:async()=>({error:null})
    },
    from:()=>({select(){return this},eq(_key,id){this.id=id;return this},maybeSingle:async function(){return {data:{user_id:this.id},error:null}}})
  };
  const store=new CloudStore(client);
  await store.login(' TEST123 ','temporary-pass');
  assert.deepEqual(JSON.parse(JSON.stringify(credentials)),{email:'test123@users.invalid',password:'temporary-pass'});
  assert.equal(store.displayName(),'test123');
  await store.login('calebchu40@example.test','owner-pass');
  assert.equal(credentials.email,'calebchu40@example.test');
});

test('username format is constrained and email registration requests confirmation without granting workspace access',async()=>{
  const CloudStore=loadCloud();let signup;
  const client={auth:{signUp:async value=>{signup=value;return {data:{session:null},error:null}}}};
  const store=new CloudStore(client);
  await assert.rejects(store.login('../not-a-username','pw'),/有效的用户名或邮箱/);
  const result=await store.registerEmail('new@example.test','long-enough-password');
  assert.deepEqual(JSON.parse(JSON.stringify(signup)),{email:'new@example.test',password:'long-enough-password'});
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{confirmationRequired:true});
  await assert.rejects(store.registerEmail('not-an-email','long-enough-password'),/有效邮箱地址/);
});

test('authorization migration preserves existing user IDs and removes only the single-owner restriction',()=>{
  const migration=fs.readFileSync('supabase/migrations/005_multi_account_authorization.sql','utf8');
  assert.match(migration,/drop constraint if exists workspace_owner_pkey/i);
  assert.match(migration,/drop column if exists singleton/i);
  assert.match(migration,/add constraint workspace_owner_pkey primary key \(user_id\)/i);
  assert.doesNotMatch(migration,/delete\s+from\s+public\.workspace_owner/i);
});
