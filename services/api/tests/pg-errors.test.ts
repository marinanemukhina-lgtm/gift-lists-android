import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Pool} from 'pg';
import {createPgDatabase} from '../src/pg';
test('idle pool errors are handled without logging database credentials or error context',async t=>{
  const prototype=Pool.prototype as unknown as EventEmitter;
  const original=prototype.on;
  let captured:EventEmitter|undefined;
  t.mock.method(prototype,'on',function(this:EventEmitter,event:string|symbol,listener:(...args:unknown[])=>void){
    if(this instanceof Pool&&event==='error')captured=this;
    return original.call(this,event,listener);
  });
  const messages:string[]=[];
  t.mock.method(process.stderr,'write',(...args:unknown[])=>{messages.push(String(args[0]));return true;});
  // Pool construction does not connect; this test performs no network operation.
  const db=createPgDatabase('postgresql://synthetic:do-not-log-this@invalid.example/test?sslmode=verify-full');
  try{
    assert.ok(captured);
    assert.doesNotThrow(()=>captured!.emit('error',Object.assign(new Error('do-not-log-this invalid.example'),{client:{password:'do-not-log-this'}})));
    assert.match(messages.join(''),/idle database connection was closed/);
    assert.doesNotMatch(messages.join(''),/do-not-log-this|invalid\.example|password|Error:/);
  }finally{await db.close();}
});
