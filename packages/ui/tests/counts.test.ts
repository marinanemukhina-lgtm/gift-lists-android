import {test} from 'node:test';
import assert from 'node:assert/strict';
import {giftCount,availableCount} from '../src/counts';
test('Russian gift and live-availability counts agree for singular, few, many and teen exceptions',()=>{
 const cases:[number,string,string][]=[[0,'подарков','доступно'],[1,'подарок','доступен'],[2,'подарка','доступны'],[4,'подарка','доступны'],[5,'подарков','доступно'],[11,'подарков','доступно'],[14,'подарков','доступно'],[21,'подарок','доступен'],[22,'подарка','доступны'],[25,'подарков','доступно'],[100,'подарков','доступно']];
 for(const [count,gifts,available] of cases){assert.equal(giftCount(count),`${count} ${gifts}`);assert.equal(availableCount(count),`${count} ${available}`);}
});
