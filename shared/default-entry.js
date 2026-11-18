/* 无深链接的站点入口默认进入英语宝宝视角；明确的成长入口及旧技能链接保持可达。 */
(function(root){
  if(root.location.hash||root.location.search)return;
  const entry=root.XIAOYA_SITE_SECTIONS?.find(section=>section.id==='english')?.entry;
  if(entry)root.location.replace(new URL(entry,root.location.href).href);
})(window);
