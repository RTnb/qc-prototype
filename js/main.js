/* ============================================================
 * 外框：路由、侧边菜单（按角色显示）、顶栏、手机抽屉菜单
 * ============================================================ */
const ALL = Object.keys(ROLES);
const DOERS = ['inspector', 'supervisor', 'manager'];
const MENU = [
  { path: '/home', label: '工作台', icon: 'HomeFilled', roles: ALL },
  { path: '/anomaly', label: '异常处理', icon: 'BellFilled', roles: ALL, badge: () => Object.values(store.anomalyStatus || {}).filter(s => s.status !== '已关闭').length },
  { group: '检验作业' },
  { path: '/inspect/IQC', label: 'IQC 进料检验', icon: 'Box', roles: DOERS },
  { path: '/inspect/IPQC', label: 'IPQC 在线巡检', icon: 'SetUp', roles: DOERS },
  { path: '/inspect/FQC', label: 'FQC 成品检验', icon: 'Goods', roles: DOERS },
  { path: '/review', label: '待审核', icon: 'Stamp', roles: ['supervisor', 'manager'], badge: () => store.forms.filter(f => f.status === 'submitted').length },
  { path: '/ncr', label: '不合格处理', icon: 'WarningFilled', roles: ['supervisor', 'manager'], badge: () => store.ncrs.filter(n => n.status === '待处置').length },
  { group: '报告与分析' },
  { path: '/ledger', label: '检验台账', icon: 'Tickets', roles: ALL },
  { path: '/trace', label: '批次追溯', icon: 'Connection', roles: ALL },
  { path: '/analytics', label: '统计分析', icon: 'DataAnalysis', roles: ['supervisor', 'manager'] },
  { group: '配置' },
  { path: '/templates', label: '模版管理', icon: 'Files', roles: ['manager', 'admin'] },
  { path: '/master', label: '基础数据', icon: 'Coin', roles: ['manager', 'admin'] },
  { path: '/system', label: '系统管理', icon: 'Setting', roles: ['admin'] },
];
const ROUTES = [
  ['/home', 'Home'], ['/inspect/:type', 'InspectList'], ['/form/:no', 'Form'], ['/review', 'Review'],
  ['/ncr', 'Ncr'], ['/anomaly', 'Anomaly'], ['/ledger', 'Ledger'], ['/report/:no', 'Report'], ['/trace', 'Trace'],
  ['/analytics', 'Analytics'], ['/templates', 'Templates'], ['/templates/:id', 'Designer'],
  ['/master', 'Master'], ['/system', 'System'],
];
function parseHash() {
  const raw = fromHash(location.hash);
  const [path, qs = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  for (const [pat, name] of ROUTES) {
    const a = pat.split('/'), b = path.split('/');
    if (a.length !== b.length) continue;
    const params = {};
    if (a.every((s, i) => s.startsWith(':') ? (params[s.slice(1)] = b[i], true) : s === b[i])) return { path, name, params, query, full: raw };
  }
  return { path: '/home', name: 'Home', params: {}, query: {}, full: '/home' };
}
const route = Vue.reactive(parseHash());
window.addEventListener('hashchange', () => { Object.assign(route, parseHash()); window.scrollTo(0, 0); });

const App = {
  setup() { return { store, route, ROLES, MENU, go, FACTORIES: ['示例工厂（越南）', '二厂'] }; },
  data() { return { drawer: false, collapsed: false }; },
  computed: {
    menu() {
      const items = MENU.filter(m => m.group || m.roles.includes(store.role));
      return items.filter((m, i) => !m.group || (items[i + 1] && !items[i + 1].group)); // 去掉空分组
    },
    activePath() {
      const p = route.path;
      if (p.startsWith('/form/') || p.startsWith('/report/')) {
        const no = route.params.no; const t = no === 'new' ? route.query.type : (no || '').split('-')[0];
        return p.startsWith('/report/') ? '/ledger' : '/inspect/' + t;
      }
      if (p.startsWith('/templates/')) return '/templates';
      return p;
    },
    me() { return ROLES[store.role]; },
    view() { return Pages[route.name]; },
  },
  watch: { 'store.role'() { const m = MENU.find(x => x.path === this.activePath); if (m && !m.roles.includes(store.role)) go('/home'); } },
  methods: { nav(p) { this.drawer = false; go(p); } },
  template: `
  <div class="shell" :class="{collapsed}">
    <aside class="sidebar hide-m">
      <div class="brand" @click="go('/home')"><span class="brand-mark">QC</span><span class="brand-text">质检数字化管理</span></div>
      <nav class="menu">
        <template v-for="m in menu" :key="m.path||m.group">
          <div v-if="m.group" class="menu-group">{{ m.group }}</div>
          <a v-else class="menu-item" :class="{active: activePath===m.path}" @click="nav(m.path)" :title="m.label">
            <el-icon><component :is="m.icon" /></el-icon><span class="menu-label">{{ m.label }}</span>
            <span v-if="m.badge && m.badge()" class="menu-badge">{{ m.badge() }}</span>
          </a>
        </template>
      </nav>
      <div class="side-foot"><a class="menu-item" @click="collapsed=!collapsed"><el-icon><component :is="collapsed?'Expand':'Fold'" /></el-icon><span class="menu-label">收起菜单</span></a></div>
    </aside>

    <div class="main">
      <header class="topbar">
        <button class="hamburger show-m" @click="drawer=true" aria-label="菜单"><el-icon :size="20"><Menu /></el-icon></button>
        <span class="m-brand show-m">质检管理</span>
        <el-select v-model="store.factory" class="factory hide-m" size="default"><el-option v-for="f in FACTORIES" :key="f" :label="f" :value="f" /></el-select>
        <span class="spacer"></span>
        <button class="vi-toggle" :class="{on: store.showVi}" @click="store.showVi=!store.showVi" title="显示/隐藏越南文">中 / VI</button>
        <el-dropdown trigger="click" @command="r=>store.role=r">
          <span class="role-pill"><span class="avatar">{{ me.user.slice(0,1) }}</span><span class="role-txt"><b>{{ me.user }}</b><small>{{ me.name }}</small></span><el-icon><ArrowDown /></el-icon></span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>原型演示：切换角色看不同权限</el-dropdown-item>
              <el-dropdown-item v-for="(r,k) in ROLES" :key="k" :command="k" :divided="k==='inspector'">
                <b style="width:84px;display:inline-block">{{ r.name }}</b><span class="muted">{{ r.user }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>
      <main class="content">
        <component :is="view" :key="route.full" :params="route.params" :query="route.query" />
      </main>
    </div>

    <el-drawer v-model="drawer" direction="ltr" size="260px" :with-header="false" class="m-drawer">
      <div class="brand"><span class="brand-mark">QC</span><span class="brand-text">质检数字化管理</span></div>
      <nav class="menu">
        <template v-for="m in menu" :key="m.path||m.group">
          <div v-if="m.group" class="menu-group">{{ m.group }}</div>
          <a v-else class="menu-item" :class="{active: activePath===m.path}" @click="nav(m.path)">
            <el-icon><component :is="m.icon" /></el-icon><span class="menu-label">{{ m.label }}</span>
            <span v-if="m.badge && m.badge()" class="menu-badge">{{ m.badge() }}</span>
          </a>
        </template>
      </nav>
      <div class="drawer-factory"><el-select v-model="store.factory"><el-option v-for="f in FACTORIES" :key="f" :label="f" :value="f" /></el-select></div>
    </el-drawer>
  </div>`,
};

const app = Vue.createApp(App);
app.use(ElementPlus, { locale: ElementPlusLocaleZhCn });
for (const [k, c] of Object.entries(ElementPlusIconsVue)) app.component(k, c);
for (const [k, c] of Object.entries(Widgets)) app.component(k, c);
app.mount('#app');
