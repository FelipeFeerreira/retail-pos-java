import {store,api,login,logout,clear,add} from '../store';
import type {Product} from '../types';
let mock:jest.SpyInstance;
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
beforeEach(()=>{store.dispatch(api.util.resetApiState());store.dispatch(logout());store.dispatch(clear());mock=jest.spyOn(globalThis,'fetch');});
afterEach(()=>{mock.mockRestore();store.dispatch(api.util.resetApiState());});
test('adds bearer credentials and returns server data',async()=>{
 store.dispatch(login({token:'test-jwt',username:'admin',role:'ADMIN'}));
 mock.mockResolvedValue(response({content:[{id:1}]}));
 const result=await store.dispatch(api.endpoints.get.initiate('/products',{subscribe:false})).unwrap();
 expect(result).toEqual({content:[{id:1}]});expect((mock.mock.calls[0][0] as Request).headers.get('Authorization')).toBe('Bearer test-jwt');
});
test('obtains CSRF before mutation and sends it with the body',async()=>{
 mock.mockResolvedValueOnce(response({token:'csrf-token'})).mockResolvedValueOnce(response({id:5}));
 const result=await store.dispatch(api.endpoints.send.initiate({url:'/categories',method:'POST',body:{name:'Bebidas'}})).unwrap();
 expect(result).toEqual({id:5});const request=mock.mock.calls[1][0] as Request;
 expect(request.headers.get('X-XSRF-TOKEN')).toBe('csrf-token');expect(await request.clone().json()).toEqual({name:'Bebidas'});
});
test('CSRF error prevents any business mutation',async()=>{
 mock.mockResolvedValue(response({message:'Unavailable'},503));
 await expect(store.dispatch(api.endpoints.send.initiate({url:'/categories',method:'POST',body:{name:'Bebidas'}})).unwrap()).rejects.toMatchObject({status:503});
 expect(mock).toHaveBeenCalledTimes(1);
});
test('expired authentication clears credentials and cart',async()=>{
 store.dispatch(login({token:'expired',username:'admin',role:'ADMIN'}));
 store.dispatch(add({product:{id:1,price:10} as Product,quantity:1}));
 mock.mockResolvedValue(response({message:'Expired'},401));
 await expect(store.dispatch(api.endpoints.get.initiate('/private',{subscribe:false})).unwrap()).rejects.toMatchObject({status:401});
 expect(store.getState().auth).toBeNull();expect(store.getState().cart).toEqual([]);
});
test('failed login is returned without clearing an existing cart',async()=>{
 store.dispatch(add({product:{id:1,price:10} as Product,quantity:1}));
 mock.mockResolvedValueOnce(response({token:'csrf'})).mockResolvedValueOnce(response({message:'Wrong password'},401));
 await expect(store.dispatch(api.endpoints.send.initiate({url:'/auth/login',method:'POST',body:{}})).unwrap()).rejects.toMatchObject({status:401});
 expect(store.getState().cart).toHaveLength(1);
});
