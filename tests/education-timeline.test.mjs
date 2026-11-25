import test from 'node:test';
import assert from 'node:assert/strict';
import {tracks,englishRows,ageRanges,rowsFor,visibleItems,layoutItems,itemAge,variantsForRange} from '../education/plan.mjs';
test('时间线全部节点保留有效原范围和独立来源，三种英语路线不互相串用',()=>{
 const ids=new Set();
 for(const track of tracks){
  const variants=track.variants?.map(item=>item.id)||[undefined];
  for(const variant of variants){
   const rows=rowsFor(track,variant);assert.ok(rows.length);
   for(const row of rows)for(const item of row.items){
    assert.ok(item.start>=0&&item.start<item.end&&item.end<=20);
    assert.ok(item.title&&item.sourceId&&item.page===1&&item.agePrecision==='approximate');
    assert.ok(!ids.has(item.id));ids.add(item.id);
   }
  }
 }
 assert.equal(rowsFor(tracks.find(t=>t.id==='english'),'later'),englishRows.later);
 assert.match(itemAge({start:18.5,end:20}),/18岁以后/);
});
test('年龄筛选以有长度交集为准，不改写节点；并行阶段不会在同一轨道重叠',()=>{
 const row={items:[{id:'a',start:0,end:6},{id:'b',start:5,end:10},{id:'c',start:10,end:12},{id:'d',start:12,end:18}]};
 const before=JSON.stringify(row),range=ageRanges.find(item=>item.id==='primary');
 assert.deepEqual(visibleItems(row,range).map(item=>item.id),['b','c']);
 const result=layoutItems(row.items);
 for(const item of result)for(const other of result)if(item.id!==other.id&&item.lane===other.lane)assert.ok(item.end<=other.start||other.end<=item.start);
 assert.equal(JSON.stringify(row),before);
});

test('英语路线与查看年龄联动，不提供该年龄内无安排的路线',()=>{
 const preschool=variantsForRange(ageRanges.find(item=>item.id==='preschool'));
 assert.equal(preschool.find(item=>item.id==='early').disabled,false);
 assert.equal(preschool.find(item=>item.id==='later').disabled,true);
 assert.ok(variantsForRange(ageRanges.find(item=>item.id==='primary')).every(item=>!item.disabled));
 assert.ok(variantsForRange(ageRanges[0]).every(item=>!item.disabled));
});
