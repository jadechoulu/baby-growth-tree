(function () {
  const shell = window.XiaoyaSite.createShell({ sectionId: 'home', siteRoot: './' });
  const header = document.createElement('header');
  header.className = 'site-welcome';
  const eyebrow = document.createElement('div');
  eyebrow.className = 'site-eyebrow';
  eyebrow.textContent = '一起探索，慢慢长大';
  const title = document.createElement('h1');
  title.textContent = '每一小步，都值得记录。';
  const description = document.createElement('p');
  description.textContent = '从身体与感知的探索，到语言世界的发现。选择今天想陪宝宝一起走的那条路。';
  header.append(eyebrow, title, description);
  const footer = document.createElement('footer');
  footer.className = 'site-home-footer';
  footer.textContent = '陪伴有节奏，成长不赶路。各分类的个人记录保存在当前浏览器。';
  shell.content.append(header, shell.createSectionCards(), footer);
  document.querySelector('#app').replaceChildren(shell.element);
})();
