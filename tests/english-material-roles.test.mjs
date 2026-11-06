import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../english/model.js'),P=require('../english/practice.js');
const read=id=>JSON.parse(fs.readFileSync(new URL('../english/data/'+id+'.json',import.meta.url)));
const raw={banana:read('banana'),qing:read('qing'),xu:read('xu'),xuCurrent:read('xu-current'),xuSupplements:[read('xu-panorama'),read('xu-thousand')],routePlan:read('route-plan')};
const catalog=M.normalize(raw);
const cat=stage=>M.getStageMaterials(catalog,stage).find(item=>item.resource.title==='大猫分级');

test('同一大猫套系的用途随路线、阶段和资料版本分别确定',()=>{
  assert.equal(cat('qing-s1').role.kind,'auxiliary');
  assert.equal(cat('qing-s2').role.kind,'auxiliary');
  assert.equal(cat('qing-s3').role.kind,'main');
  assert.equal(cat('qing-s6').role.kind,'main');
  assert.equal(cat('qing-s7').role.kind,'auxiliary');
  assert.equal(cat('xu-3').role.kind,'auxiliary');
  assert.equal(cat('xu-current-300').role.kind,'reference');
  assert.equal(cat('xu-current-300').role.usage,'闪卡式绘本');
  assert.equal(cat('banana-1').role.kind,'reference');
});

test('作者未划分主辅时不以摘要、套系共用、活动分支或整理字段推断',()=>{
  const book=cat('banana-1'),stage=catalog.stages.find(s=>s.id==='banana-1');
  const withSummary={...stage,raw:{...stage.raw,summary:book.resource.title}};
  const withoutSummary={...stage,raw:{...stage.raw,summary:''}};
  for(const st of [withSummary,withoutSummary])assert.equal(M.getStageMaterials(catalog,st).find(i=>i.resource.id===book.resource.id).role.kind,'reference');
  assert.equal(cat('xu-2').material.role,'core');
  assert.equal(cat('xu-2').role.kind,'reference');
  assert.equal(cat('xu-panorama-listening-500').role.kind,'reference');
  const execution=catalog.stages.filter(s=>s.variantId==='xu-thousand').flatMap(st=>M.getStageMaterials(catalog,st));
  assert.ok(execution.some(i=>i.material.role==='main'));
  assert.ok(execution.filter(i=>i.material.role==='main'||i.material.role==='core').every(i=>i.role.kind==='reference'));
});

test('展示角色纠正不改原始引用、来源、级别或个人记录键',()=>{
  const before=structuredClone(catalog);
  for(const stage of catalog.stages){
    for(const item of M.getStageMaterials(catalog,stage)){
      const key=P.unitKey(stage,item);
      const changed={...item,role:{kind:'main',label:'展示变化',basis:'展示依据变化'}};
      assert.equal(P.unitKey(stage,changed),key);
    }
  }
  assert.deepEqual(catalog,before);
});

test('原图分支不生成选读要求，各路线角色共用同一分类表',()=>{
  for(const stage of catalog.stages){
    for(const item of M.getStageMaterials(catalog,stage))assert.equal(item.role.label,M.materialRoles[item.role.kind]);
  }
  const item=cat('xu-current-500');
  assert.equal(item.role.kind,'auxiliary');
  assert.equal(item.role.usage,'辅线');
    assert.equal(item.role.evidence.usage,'平行拓展','原始用途证据不改写');
  assert.ok(!item.role.usage.includes('选读'));
  assert.equal(item.role.selection,null);
  for(const [stageId,choice]of [['qing-s4','选2–3部'],['qing-s5','任选2部']]){
    const fox=M.getStageMaterials(catalog,stageId).find(i=>i.resource.id==='resource-mxtrmb');
    assert.equal(fox.role.kind,'main');
    assert.equal(fox.role.selection.label,choice);
    assert.equal(fox.role.selection.basis,fox.material.original);
  }
});

test('历史五节点的每次引用均有可追溯核查，确认角色与未核定引用分别保留',()=>{
  const stages=catalog.stages.filter(s=>s.variantId==='xu-current');
  const materials=stages.flatMap(stage=>M.getStageMaterials(catalog,stage));
  const sources=new Map(catalog.sources.map(source=>[source.id,source]));
  assert.equal(materials.length,25);
  assert.equal(materials.filter(item=>item.role.evidence?.status==='confirmed').length,5);
  assert.equal(materials.filter(item=>item.role.evidence?.status==='unresolved').length,20);
  for(const item of materials){
    const evidence=item.material.roleEvidence;
    assert.ok(evidence?.basis&&evidence.checkedAt,item.material.original);
    assert.ok(evidence.sources.length>0,item.material.original);
    assert.deepEqual(item.role.evidence,evidence);
    assert.equal(item.role.kind,evidence.status==='confirmed'?evidence.kind:'reference');
    for(const reference of evidence.sources){
      const source=sources.get(reference.sourceId);
      assert.ok(source,`${item.material.original} 来源不存在：${reference.sourceId}`);
      assert.ok(reference.quote.trim(),`${item.material.original} 来源缺少原文`);
      if(reference.page!=null){
        const preview=source.previews.find(page=>page.page===reference.page);
        assert.ok(preview,`${reference.sourceId} 缺少第${reference.page}页`);
        assert.ok(fs.existsSync(new URL('../english/'+preview.path,import.meta.url)),preview.path);
      }
    }
  }
  const confirmed=M.getStageMaterials(catalog,'xu-current-500').filter(item=>item.role.evidence.status==='confirmed');
  assert.equal(confirmed.filter(item=>item.role.kind==='main').length,1);
  const parallel=confirmed.filter(item=>item.role.kind==='auxiliary');
  assert.equal(parallel.length,4);
  for(const item of parallel){
    assert.equal(item.role.usage,'辅线');
    assert.equal(item.role.evidence.usage,'平行拓展','原始用途证据不改写');
    assert.equal(item.role.selection,null,'平行拓展不能自动生成任选或选读要求');
  }
});

test('六阶段路线、进度分项与图鉴共用逐项证据，移除证据不再按阶段ID补主辅线',()=>{
  const withoutEvidence=structuredClone(raw),volumes=read('resource-volumes');
  for(const stage of withoutEvidence.xu.stages)for(const material of [...stage.materials,...stage.animations])delete material.roleEvidence;
  const baseline=M.normalize(withoutEvidence),sourceIds=new Set(catalog.sources.map(source=>source.id));
  for(const stage of catalog.stages.filter(stage=>stage.variantId==='xu-listening')){
    const previous=M.getStageMaterials(baseline,stage.id);
    for(const item of M.getStageMaterials(catalog,stage)){
      const evidence=item.material.roleEvidence,expected=['main','parallel'].includes(item.material.role);
      assert.ok(evidence?.basis&&evidence.checkedAt,item.material.original);
      assert.equal(evidence.status,expected?'confirmed':'unresolved');
      assert.equal(item.role.kind,expected?(item.material.role==='main'?'main':'auxiliary'):'reference');
      assert.ok(evidence.sources.length>0);
      for(const source of evidence.sources){assert.ok(sourceIds.has(source.sourceId));assert.ok(source.quote);}
      const appearance=item.resource.appearances.find(a=>a.stageId===stage.id&&a.original===item.material.original&&a.level===item.material.level);
      assert.deepEqual(appearance.roleEvidence,evidence,'素材图鉴引用须保留同一次用途依据');
      const usage=M.getSeriesProgression(catalog,item.resource.id).flatMap(group=>group.stages).find(a=>a.stageId===stage.id&&a.original===item.material.original&&a.level===item.material.level);
      assert.deepEqual(usage.roleEvidence,evidence,'路线使用明细不单独维护用途');
      const original=previous.find(i=>i.material.original===item.material.original&&i.material.role===item.material.role);
      assert.equal(original.role.kind,'reference','缺少依据时不由阶段ID或main/parallel字段补角色');
      assert.equal(P.unitKey(stage,item),P.unitKey(stage,original),'补齐用途不得改变个人记录键');
      const scopes=P.bookScopes(item.resource.id,item.materials.map(m=>m.level),volumes,stage.id);
      const units=P.expandBookUnits({key:P.unitKey(stage,item),stageId:stage.id,item,resourceId:item.resource.id,label:item.resource.title,bookScopes:scopes},M.getMaterialLevels(item),volumes);
      assert.ok(units.every(unit=>unit.item.role.kind===item.role.kind),'进度各级分项继承同一角色');
    }
  }
});

test('去掉逐次引用证据后不按品牌、主节点或配套分支猜角色，且原引用与记录键不变',()=>{
  const input=structuredClone(raw),snapshot=structuredClone(input),withoutEvidence=structuredClone(raw);
  for(const stage of withoutEvidence.xuCurrent.stages)for(const material of stage.materials)delete material.roleEvidence;
  const withCatalog=M.normalize(input),withoutCatalog=M.normalize(withoutEvidence);
  assert.deepEqual(input,snapshot,'规范化及用途核查不得改写原始输入');
  const omitEvidence=material=>{const copy={...material};delete copy.roleEvidence;return copy;};
  for(const stage of withCatalog.stages.filter(stage=>stage.variantId==='xu-current')){
    const oldStage=withoutCatalog.stages.find(candidate=>candidate.id===stage.id);
    assert.deepEqual(stage.materials.map(omitEvidence),oldStage.materials);
    const oldItems=new Map(M.getStageMaterials(withoutCatalog,oldStage).map(item=>[P.unitKey(oldStage,item),item]));
    const items=M.getStageMaterials(withCatalog,stage);
    assert.equal(items.length,oldItems.size);
    for(const item of items){
      const previous=oldItems.get(P.unitKey(stage,item));
      assert.ok(previous,`${stage.id} ${item.material.original} 的稳定记录键变化`);
      assert.equal(previous.role.kind,'reference');
      assert.deepEqual(item.materials.map(omitEvidence),previous.materials);
      assert.deepEqual(omitEvidence(item.material),previous.material);
    }
  }
});

test('已确认用途不向同品牌的其他阶段或资料版本传播',()=>{
  assert.equal(cat('xu-current-500').role.kind,'auxiliary');
  assert.equal(cat('xu-current-300').role.kind,'reference');
  assert.equal(cat('xu-current-800').role.kind,'reference');
  assert.equal(cat('xu-panorama-listening-500').role.kind,'reference');
  assert.equal(cat('xu-3').role.kind,'auxiliary');
  const gk=M.getStageMaterials(catalog,'xu-current-500').find(item=>item.material.level==='GK');
  assert.equal(gk.role.kind,'main');
  const panoramaGK=M.getStageMaterials(catalog,'xu-panorama-listening-500').find(item=>item.resource.id===gk.resource.id);
  assert.ok(panoramaGK);
  assert.equal(panoramaGK.role.kind,'reference');
});

test('未核定引用保留具体跨版本限制，不把另一阶段主线或自读顺序当作当前角色',()=>{
  const find=(stageId,rawId)=>M.getStageMaterials(catalog,stageId).find(item=>item.material.original===rawId);
  const oxford=find('xu-current-800','牛津树1-3');
  assert.equal(oxford.role.kind,'reference');
  const reader=oxford.role.evidence.sources.find(source=>source.sourceId==='xu-xhs-reader-booklist');
  assert.match(reader.quote,/1000词.*主线.*牛津树1[–-]3/);
  assert.match(reader.note,/800词.*不同/);
  const pete=find('xu-current-1000','皮特猫');
  assert.equal(pete.role.kind,'reference');
  const execution=pete.role.evidence.sources.find(source=>source.sourceId==='xu-thousand');
  assert.equal(execution.page,4);
  assert.match(execution.note,/自读.*不等于.*听力1000词/);
  assert.equal(pete.role.selection,null);
  const peppa=find('xu-current-2000','小猪佩奇');
  assert.equal(peppa.role.kind,'reference');
  assert.match(peppa.role.evidence.basis,/未给动画主辅或季数/);
});


test('平行拓展全局显示为辅线，整理字段不冒充已核定用途',()=>{
  assert.equal(M.materialUsageLabel('平行拓展'),'辅线');
  for(const stage of catalog.stages)for(const item of M.getStageMaterials(catalog,stage)){
    if(item.material.role==='parallel')assert.equal(M.materialUsageLabel(item.material.role,item.role),item.role.kind==='auxiliary'?'辅线':'并行材料');
    assert.notEqual(item.role.usage,'平行拓展');
  }
  assert.ok(catalog.relationships.some(edge=>edge.type==='pair'&&edge.label.includes('主线与辅线')));
  assert.ok(!catalog.relationships.some(edge=>edge.label.includes('主线与平行拓展')));
});
