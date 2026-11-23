/* ============================================================
 * 检验作业相关页面：工作台、检验单列表、检验单填写/审核、待审核
 * ============================================================ */
const Pages = {};
/* 页面地址用简单名字（#form-IQC-20261123-0001），在线发布的链接里也能用 */
const HASH_PREFIX = { inspect: 'inspect', form: 'form', report: 'report', templates: 'tpl' };
function toHash(path) {
  const [p, qs] = path.split('?');
  if (p === '/form/new') return 'new-' + (new URLSearchParams(qs || '').get('type') || 'IQC');
  const m = p.match(/^\/(inspect|form|report|templates)\/(.+)$/);
  if (m) return HASH_PREFIX[m[1]] + '-' + m[2];
  return p.replace(/^\//, '') || 'home';
}
function fromHash(h) {
  h = decodeURIComponent((h || '').replace(/^#/, ''));
  if (!h) return '/home';
  if (h.startsWith('/')) return h; // 兼容旧地址
  let m = h.match(/^new-([A-Z]+)$/);
  if (m) return '/form/new?type=' + m[1];
  m = h.match(/^(inspect|form|report|tpl)-(.+)$/);
  if (m) return '/' + Object.keys(HASH_PREFIX).find(k => HASH_PREFIX[k] === m[1]) + '/' + m[2];
  return '/' + h;
}
const go = path => { location.hash = toHash(path); };
/* 在线体验版（嵌在 claude.ai 页面里）不能打印、不能下载文件 */
const EMBEDDED = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
function embeddedNotice(what) { ElementPlus.ElMessage({ type: 'info', duration: 4000, message: `在线体验版不能${what}；正式系统里这个按钮可以直接用。` }); }
function formSubject(f) {
  const h = f.header;
  if (f.type === 'IQC') return supplierName(h.supplier);
  if (f.type === 'IPQC') return `${h.workshop || ''} · ${h.order || ''}`;
  return `${customerName(h.customer)} · ${h.order || ''}`;
}
function formObject(f) { return materialName(f.header.material || f.header.product); }

/* ---------- 工作台 ---------- */
Pages.Home = {
  setup() { return { store, TYPES, ROLES, go, formSubject }; },
  computed: {
    me() { return ROLES[store.role]; },
    canCreate() { return ['inspector', 'supervisor', 'manager'].includes(store.role); },
    today() { return ymd(new Date()); },
    todayForms() { return store.forms.filter(f => f.date === this.today); },
    myTodo() {
      if (store.role === 'inspector') return store.forms.filter(f => ['draft', 'returned'].includes(f.status));
      if (['supervisor', 'manager'].includes(store.role)) return store.forms.filter(f => f.status === 'submitted');
      return [];
    },
    openNcr() { return store.ncrs.filter(n => n.status !== '已关闭'); },
    stats() {
      const month = this.today.slice(0, 7);
      const fs = store.forms.filter(f => f.date.startsWith(month) && f.result);
      const rate = t => { const a = fs.filter(f => f.type === t); return a.length ? (a.filter(f => f.result === 'OK').length / a.length * 100).toFixed(1) : '—'; };
      return [
        { label: '今日检验单', value: this.todayForms.length, unit: '张' },
        { label: '本月进料批次合格率', value: rate('IQC'), unit: '%' },
        { label: '本月巡检合格率', value: rate('IPQC'), unit: '%' },
        { label: '本月成品一次合格率', value: rate('FQC'), unit: '%' },
      ];
    },
    recent() { return store.forms.filter(f => f.status !== 'draft').slice(0, 6); },
  },
  methods: { open(f) { go('/form/' + f.no); } },
  template: `
  <div class="page home">
    <div class="hello">
      <h2>{{ me.user }}，你好</h2>
      <p class="muted">{{ store.factory }} · {{ me.name }} · {{ today }}</p>
    </div>
    <div v-if="canCreate" class="quick-create">
      <button v-for="(t,k) in TYPES" :key="k" class="qc-btn" :style="{'--c':t.color,'--bg':t.bg}" @click="go('/form/new?type='+k)">
        <span class="qc-type">{{ k }}</span>
        <span class="qc-name">新建{{ t.short }}{{ k==='IPQC' ? '表' : '检验' }}</span>
        <small class="qc-vi" v-if="store.showVi">{{ t.vi }}</small>
        <el-icon class="qc-plus"><Plus /></el-icon>
      </button>
    </div>
    <div class="kpi-row">
      <div v-for="s in stats" :key="s.label" class="kpi"><div class="kpi-label">{{ s.label }}</div><div class="kpi-value">{{ s.value }}<small>{{ s.unit }}</small></div></div>
    </div>
    <div class="grid-2">
      <el-card shadow="never" class="panel">
        <template #header><div class="panel-h"><span>我的待办</span><el-badge :value="myTodo.length" :hidden="!myTodo.length" /></div></template>
        <el-empty v-if="!myTodo.length" description="暂无待办" :image-size="70" />
        <div v-for="f in myTodo.slice(0,8)" :key="f.no" class="list-row" @click="open(f)">
          <TypeTag :type="f.type" /><span class="mono">{{ f.no }}</span><span class="ellipsis muted">{{ formSubject(f) }}</span><StatusTag :status="f.status" />
        </div>
      </el-card>
      <el-card shadow="never" class="panel">
        <template #header><div class="panel-h"><span>最近单据</span><el-link type="primary" @click="go('/ledger')">查看台账</el-link></div></template>
        <div v-for="f in recent" :key="f.no" class="list-row" @click="open(f)">
          <TypeTag :type="f.type" /><span class="mono">{{ f.no }}</span><span class="ellipsis muted">{{ f.inspector }}</span><ResultTag :result="f.result" size="sm" />
        </div>
      </el-card>
    </div>
    <el-card v-if="openNcr.length && store.role!=='inspector'" shadow="never" class="panel">
      <template #header><div class="panel-h"><span>未关闭的不合格处理单</span><el-link type="primary" @click="go('/ncr')">去处理</el-link></div></template>
      <div v-for="n in openNcr.slice(0,5)" :key="n.no" class="list-row" @click="go('/ncr')">
        <span class="mono">{{ n.no }}</span><span class="ellipsis">{{ n.desc }}</span><span class="muted">{{ n.owner }}</span>
        <el-tag size="small" :type="n.status==='待处置'?'danger':'warning'">{{ n.status }}</el-tag>
      </div>
    </el-card>
  </div>`,
};

/* ---------- 检验单列表 ---------- */
Pages.InspectList = {
  props: ['params'],
  setup() { return { store, TYPES, STATUS, go, formSubject, formObject }; },
  data() { return { tab: 'all', kw: '' }; },
  computed: {
    type() { return this.params.type; },
    t() { return TYPES[this.type]; },
    rows() {
      return store.forms.filter(f => f.type === this.type
        && (this.tab === 'all' || f.status === this.tab)
        && (!this.kw || [f.no, f.header.order, f.header.lot, formSubject(f), formObject(f), f.inspector].join(' ').includes(this.kw)));
    },
    counts() { const c = { all: 0 }; store.forms.filter(f => f.type === this.type).forEach(f => { c.all++; c[f.status] = (c[f.status] || 0) + 1; }); return c; },
    canCreate() { return ['inspector', 'supervisor', 'manager'].includes(store.role); },
  },
  template: `
  <div class="page">
    <div class="page-head">
      <h2><TypeTag :type="type" /> {{ t.name }} <small class="muted" v-if="store.showVi">{{ t.vi }}</small></h2>
      <el-button v-if="canCreate" type="primary" :icon="'Plus'" @click="go('/form/new?type='+type)">新建</el-button>
    </div>
    <div class="toolbar">
      <el-radio-group v-model="tab">
        <el-radio-button value="all">全部 {{ counts.all||0 }}</el-radio-button>
        <el-radio-button v-for="(s,k) in STATUS" :key="k" :value="k">{{ s.label }} {{ counts[k]||0 }}</el-radio-button>
      </el-radio-group>
      <el-input v-model="kw" placeholder="单号 / 订单号 / 供应商 / 客户" clearable :prefix-icon="'Search'" class="kw" />
    </div>
    <el-table :data="rows" class="hide-m" stripe @row-click="r=>go('/form/'+r.no)" row-class-name="clickable" height="calc(100vh - 250px)">
      <el-table-column label="单号" width="180"><template #default="{row}"><span class="mono">{{ row.no }}</span></template></el-table-column>
      <el-table-column prop="date" label="日期" width="110" />
      <el-table-column :label="type==='IQC'?'供应商':type==='IPQC'?'车间 · 订单号':'客户 · 订单号'" min-width="180"><template #default="{row}">{{ formSubject(row) }}</template></el-table-column>
      <el-table-column :label="type==='IQC'?'物料':'产品'" min-width="200" show-overflow-tooltip><template #default="{row}">{{ formObject(row) }}</template></el-table-column>
      <el-table-column v-if="type==='IPQC'" label="巡检轮次" width="90"><template #default="{row}">{{ row.rounds.length }} / 6</template></el-table-column>
      <el-table-column v-else label="数量" width="90" align="right"><template #default="{row}">{{ row.header.qty }}</template></el-table-column>
      <el-table-column prop="inspector" label="检验员" width="90" />
      <el-table-column label="判定" width="90"><template #default="{row}"><ResultTag :result="row.result" size="sm" /></template></el-table-column>
      <el-table-column label="状态" width="90"><template #default="{row}"><StatusTag :status="row.status" /></template></el-table-column>
    </el-table>
    <div class="show-m card-list">
      <div v-for="f in rows" :key="f.no" class="m-card" @click="go('/form/'+f.no)">
        <div class="m-card-top"><span class="mono">{{ f.no }}</span><StatusTag :status="f.status" /></div>
        <div class="m-card-main">{{ formSubject(f) }}</div>
        <div class="m-card-sub">{{ formObject(f) }}<template v-if="f.type==='IPQC'"> · 巡检 {{ f.rounds.length }}/6 轮</template></div>
        <div class="m-card-foot"><span class="muted">{{ f.date }} · {{ f.inspector }}</span><ResultTag :result="f.result" size="sm" /></div>
      </div>
      <el-empty v-if="!rows.length" description="没有单据" />
    </div>
  </div>`,
};

/* ---------- 检验单：新建 / 填写 / 查看 / 审核 ---------- */
Pages.Form = {
  props: ['params', 'query'],
  components: { ItemField: Widgets.ItemField, PatrolSheet: Widgets.PatrolSheet },
  setup() { return { store, TYPES, MASTER, ROLES, LEVELS, LEVEL_KEYS, RESULTS, SAMPLING_METHODS, go, supplierName, materialName, customerName }; },
  data() { return { f: null, isNew: false, reviewComment: '', reviewResult: '', errs: [], showErrs: false }; },
  created() { this.load(); },
  computed: {
    t() { return TYPES[this.f.type]; },
    me() { return ROLES[store.role]; },
    editable() { return ['draft', 'returned'].includes(this.f.status) && !['viewer', 'admin'].includes(store.role); },
    canReview() { return this.f.status === 'submitted' && ['supervisor', 'manager'].includes(store.role); },
    tplOptions() { return store.templates.filter(t => t.type === this.f.type && t.status === '已发布'); },
    summary() { return summarize(this.f); },
    blocks() {
      const out = [];
      this.f.items.filter(i => !isPatrol(i)).forEach(it => {
        let b = out[out.length - 1];
        if (!b || b.group !== it.group) { b = { group: it.group, vi: it.groupVi, items: [] }; out.push(b); }
        b.items.push(it);
      });
      return out;
    },
    judgeItems() { return this.f.items.filter(i => ['judge', 'measure', 'table'].includes(i.type)); },
    doneCount() { return this.judgeItems.filter(i => !!itemResult(i, this.f.values[i.id])).length; },
    materials() { return this.f.header.supplier ? MASTER.materials.filter(m => m.supplier === this.f.header.supplier) : MASTER.materials; },
    verdict() { return this.f.result || this.summary.suggest; },
  },
  methods: {
    load() {
      this.showErrs = false; this.errs = [];
      if (this.params.no === 'new') {
        const type = this.query.type || 'IQC';
        const f = newFormSkeleton(type, '（提交时生成）');
        f.inspector = this.me.user;
        applyTemplate(f, store.templates);
        recalcPlan(f);
        this.f = Vue.reactive(f); this.isNew = true;
      } else {
        this.f = store.forms.find(x => x.no === this.params.no) || null; this.isNew = false;
        this.reviewResult = this.f ? this.f.suggest : '';
      }
    },
    back() { history.length > 1 ? history.back() : go('/inspect/' + this.f.type); },
    recalc() { recalcPlan(this.f); },
    switchTpl(id) { applyTemplate(this.f, store.templates, store.templates.find(t => t.id === id)); recalcPlan(this.f); },
    onSupplier() { if (this.f.header.material && !this.materials.find(m => m.code === this.f.header.material)) this.f.header.material = ''; },
    onMaterial() {
      const m = MASTER.materials.find(x => x.code === this.f.header.material);
      if (m) { if (!this.f.header.supplier) this.f.header.supplier = m.supplier; this.f.header.spec = m.spec; }
      const tpl = matchTemplate(this.f, store.templates);
      if (tpl && tpl.id !== this.f.tplId) { applyTemplate(this.f, store.templates, tpl); ElementPlus.ElMessage.info(`已按物料自动切换模版：${tpl.docNo} ${tpl.name}`); }
      else resolveSpec(this.f);
      recalcPlan(this.f);
    },
    onProduct() {
      const p = MASTER.products.find(x => x.code === this.f.header.product);
      if (!p) return;
      this.f.header.spec = p.spec;
      if (this.f.type === 'FQC') {
        this.f.header.customer = p.customer;
        const na = p.wick > 1 ? 'fD1' : 'fD2', other = p.wick > 1 ? 'fD2' : 'fD1';
        if (this.f.values[na] && !this.f.values[na].judge) this.f.values[na].judge = 'NA';
        if (this.f.values[other] && this.f.values[other].judge === 'NA') this.f.values[other].judge = '';
      }
    },
    allOk() {
      let n = 0;
      this.f.items.forEach(it => { if (it.type === 'judge' && !this.f.values[it.id].judge) { this.f.values[it.id].judge = 'OK'; n++; } });
      ElementPlus.ElMessage.success(n ? `已把 ${n} 个未判定项设为 OK` : '没有未判定的项');
    },
    addProblem() { this.f.problems.push({ time: this.f.rounds.length ? this.f.rounds[this.f.rounds.length - 1].time : hm(), desc: '', cause: '', action: '' }); },
    persist() {
      if (!this.isNew) return;
      this.f.no = nextNo(this.f.type, store.forms);
      store.forms.unshift(this.f);
      this.isNew = false;
      history.replaceState(null, '', '#' + toHash('/form/' + this.f.no));
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    },
    saveDraft() { this.persist(); computeSummary(this.f); addLog('暂存', this.f.no); ElementPlus.ElMessage.success('已暂存'); },
    submit() {
      this.errs = validateForm(this.f);
      if (this.errs.length) { this.showErrs = true; return; }
      this.persist();
      Object.assign(this.f, { status: 'submitted', submittedAt: nowStr(), result: null });
      computeSummary(this.f);
      addLog('提交', this.f.no, `系统判定 ${RESULTS[this.f.result].zh}`);
      if (this.f.result === 'NG' && this.f.type === 'IPQC') ElementPlus.ElNotification({ title: '已即时通知 QC 主管', message: `${this.f.no} 巡检发现不良`, type: 'warning' });
      ElementPlus.ElMessage.success('已提交，等待审核');
    },
    approve() {
      const f = this.f;
      Object.assign(f, { result: this.reviewResult || f.suggest, status: 'approved', reviewer: this.me.user, reviewedAt: nowStr(), reviewComment: this.reviewComment });
      addLog('审核通过', f.no, `检验结果 ${RESULTS[f.result].zh}`);
      if (f.result !== 'OK' && !f.ncrNo) {
        const n = { no: `NCR-${ymdCompact(new Date())}-${pad(store.ncrs.length + 1, 3)}`, formNo: f.no, type: f.type, createdAt: ymd(new Date()), desc: (f.result === 'HOLD' ? '待定：' : '') + (f.mainDefect || '检验不合格'), disposition: '', owner: f.type === 'IQC' ? supplierName(f.header.supplier) : (f.header.workshop || '生产部'), action: '', confirmer: '', status: '待处置', closedAt: '' };
        store.ncrs.unshift(n); f.ncrNo = n.no;
        ElementPlus.ElNotification({ title: '已自动生成不合格处理单', message: n.no, type: 'warning' });
      }
      ElementPlus.ElMessage.success('审核通过，已生成报告与台账记录');
      go('/report/' + f.no);
    },
    reject() {
      if (!this.reviewComment) { ElementPlus.ElMessage.warning('退回请填写审核意见'); return; }
      Object.assign(this.f, { status: 'returned', reviewer: this.me.user, reviewComment: this.reviewComment, result: null });
      addLog('退回', this.f.no, this.reviewComment);
      ElementPlus.ElMessage.success('已退回检验员');
    },
  },
  template: `
  <div class="page form-page" v-if="f">
    <div class="page-head">
      <h2><span class="back" @click="back"><el-icon><ArrowLeft /></el-icon></span><TypeTag :type="f.type" /> {{ isNew ? '新建' + t.short + (f.type==='IPQC'?'表':'检验单') : f.no }}</h2>
      <div class="head-actions">
        <StatusTag v-if="!isNew" :status="f.status" />
        <el-button v-if="f.status==='approved'" :icon="'Document'" @click="go('/report/'+f.no)">查看报告</el-button>
      </div>
    </div>
    <FlowSteps :status="isNew?'draft':f.status" :result="f.result" class="hide-m" />
    <el-alert v-if="f.status==='returned' && f.reviewComment" type="error" :closable="false" show-icon class="mb">
      <template #title>审核退回（{{ f.reviewer }}）：{{ f.reviewComment }}</template>
    </el-alert>

    <div class="form-layout">
      <div class="form-main">
        <el-card shadow="never" class="panel">
          <template #header><div class="panel-h">
            <span><span class="doc-no">{{ f.docNo }}</span> {{ f.tplName }}</span>
            <span class="tpl-pick" v-if="editable && tplOptions.length>1">换模版
              <el-select :model-value="f.tplId" size="small" style="width:210px" @change="switchTpl">
                <el-option v-for="t in tplOptions" :key="t.id" :label="t.docNo+' '+t.name" :value="t.id" />
              </el-select></span>
            <span v-else class="muted small">v{{ f.tplVersion }}</span>
          </div></template>
          <el-form label-position="top" class="hdr-grid" :disabled="!editable">
            <template v-if="f.type==='IQC'">
              <el-form-item required><template #label><Bi zh="供应商" vi="Nhà cung ứng" inline /></template>
                <el-select v-model="f.header.supplier" filterable placeholder="选择供应商" @change="onSupplier"><el-option v-for="s in MASTER.suppliers" :key="s.code" :label="s.name" :value="s.code" /></el-select></el-form-item>
              <el-form-item required><template #label><Bi zh="物料名称" vi="Tên nguyên vật liệu" inline /></template>
                <el-select v-model="f.header.material" filterable placeholder="选择物料（自动带出模版和规格）" @change="onMaterial"><el-option v-for="m in materials" :key="m.code" :label="m.name" :value="m.code" /></el-select></el-form-item>
              <el-form-item><template #label><Bi zh="规格型号" vi="Mã quy cách" inline /></template><el-input v-model="f.header.spec" /></el-form-item>
              <el-form-item required><template #label><Bi zh="来料数量" vi="Số lượng nhập" inline /></template><el-input-number v-model="f.header.qty" :min="0" :controls="false" @change="recalc" style="width:100%" /></el-form-item>
              <el-form-item><template #label><Bi zh="接收日期" vi="Ngày tiếp nhận" inline /></template><el-date-picker v-model="f.header.receiveDate" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
              <el-form-item><template #label><Bi zh="检验日期" vi="Ngày kiểm tra" inline /></template><el-input :model-value="f.date" disabled /></el-form-item>
              <el-form-item><template #label><Bi zh="订单号" vi="Số PO" inline /></template><el-input v-model="f.header.order" placeholder="可扫码" /></el-form-item>
              <el-form-item><template #label>批号 <small class="muted">（系统追溯用，选填）</small></template><el-input v-model="f.header.lot" /></el-form-item>
            </template>
            <template v-else-if="f.type==='IPQC'">
              <el-form-item required><template #label><Bi zh="产品名称" vi="Tên sản phẩm" inline /></template>
                <el-select v-model="f.header.product" @change="onProduct"><el-option v-for="p in MASTER.products" :key="p.code" :label="p.name" :value="p.code" /></el-select></el-form-item>
              <el-form-item required><template #label><Bi zh="订单号/货号" vi="Số đơn đặt / số hàng" inline /></template><el-input v-model="f.header.order" /></el-form-item>
              <el-form-item><template #label><Bi zh="订单数量" vi="Số lượng đơn đặt" inline /></template><el-input-number v-model="f.header.orderQty" :min="0" :controls="false" style="width:100%" /></el-form-item>
              <el-form-item><template #label><Bi zh="生产车间" vi="Xưởng sản xuất" inline /></template>
                <el-select v-model="f.header.workshop"><el-option v-for="w in MASTER.workshops" :key="w" :label="w" :value="w" /></el-select></el-form-item>
              <el-form-item><template #label><Bi zh="日期" vi="Ngày tháng" inline /></template><el-input :model-value="f.date" disabled /></el-form-item>
              <el-form-item><template #label>InlineQC</template><el-input :model-value="f.inspector" disabled /></el-form-item>
              <el-form-item><template #label><Bi zh="室内温度 ℃" vi="Nhiệt độ trong phòng" inline /></template><el-input-number v-model="f.header.temp" :controls="false" style="width:100%" /></el-form-item>
              <el-form-item><template #label><Bi zh="室内潮湿度 %" vi="Độ ẩm trong phòng" inline /></template><el-input-number v-model="f.header.humidity" :controls="false" style="width:100%" /></el-form-item>
              <el-form-item><template #label><Bi zh="页次" vi="Trang" inline /></template><el-input-number v-model="f.header.page" :min="1" style="width:100%" /></el-form-item>
            </template>
            <template v-else>
              <el-form-item required><template #label><Bi zh="客户名称" vi="Khách hàng" inline /></template>
                <el-select v-model="f.header.customer"><el-option v-for="c in MASTER.customers" :key="c.code" :label="c.name" :value="c.code" /></el-select></el-form-item>
              <el-form-item required><template #label><Bi zh="产品名称" vi="Sản phẩm" inline /></template>
                <el-select v-model="f.header.product" @change="onProduct"><el-option v-for="p in MASTER.products" :key="p.code" :label="p.name" :value="p.code" /></el-select></el-form-item>
              <el-form-item><template #label><Bi zh="规格型号" vi="Mã quy cách" inline /></template><el-input v-model="f.header.spec" /></el-form-item>
              <el-form-item required><template #label><Bi zh="生产数量" vi="Số lượng sản xuất" inline /></template><el-input-number v-model="f.header.qty" :min="0" :controls="false" @change="recalc" style="width:100%" /></el-form-item>
              <el-form-item><template #label><Bi zh="检验日期" vi="Ngày kiểm tra" inline /></template><el-input :model-value="f.date" disabled /></el-form-item>
              <el-form-item required><template #label><Bi zh="订单号" vi="Mã đơn hàng" inline /></template><el-input v-model="f.header.order" /></el-form-item>
            </template>
          </el-form>
        </el-card>

        <!-- 进料 / 成品：检验项目 -->
        <template v-if="f.type!=='IPQC'">
          <div class="items-head">
            <h3><Bi zh="检验项目" :vi="f.type==='IQC'?'Nội dung kiểm tra':'Hạng mục rút kiểm'" inline /></h3>
            <span class="muted">已完成 {{ doneCount }} / {{ judgeItems.length }}</span>
            <span class="spacer"></span>
            <el-button v-if="editable" size="small" @click="allOk">未判定的全部 OK</el-button>
          </div>
          <div v-for="b in blocks" :key="b.group" class="item-block">
            <div v-if="b.group" class="block-h"><Bi :zh="b.group" :vi="b.vi" inline /></div>
            <div class="items">
              <ItemField v-for="(it,i) in b.items" :key="it.id" :index="i+1" :item="it" :val="f.values[it.id]" :readonly="!editable" :form-no="f.no" :inspector="f.inspector" :ng-photo="f.ngPhoto" />
            </div>
          </div>
        </template>

        <!-- 巡检表 -->
        <template v-else>
          <div class="items-head"><h3><Bi zh="巡检记录" vi="Mục tuần kiểm" inline /></h3><span class="muted small">{{ f.tplNote }}</span></div>
          <PatrolSheet :f="f" :editable="editable" />
          <el-card shadow="never" class="panel mt">
            <template #header><div class="panel-h"><Bi zh="存在的问题 / 原因分析 / 处理措施" vi="Mô tả vấn đề · Phân tích nguyên nhân · Cách xử lý" inline />
              <el-button v-if="editable" size="small" :icon="'Plus'" @click="addProblem">添加问题</el-button></div></template>
            <el-empty v-if="!f.problems.length" description="没有问题记录" :image-size="50" />
            <div v-for="(p,i) in f.problems" :key="i" class="problem-row">
              <el-input v-model="p.time" :disabled="!editable" style="width:80px" placeholder="时间" />
              <el-input v-model="p.desc" :disabled="!editable" placeholder="存在的问题描述" />
              <el-input v-model="p.cause" :disabled="!editable" placeholder="原因分析" />
              <el-input v-model="p.action" :disabled="!editable" placeholder="处理措施" />
              <el-button v-if="editable" text type="danger" :icon="'Delete'" @click="f.problems.splice(i,1)" />
            </div>
          </el-card>
        </template>

        <el-card shadow="never" class="panel mt">
          <template #header><Bi zh="备注" vi="Ghi chú" inline /></template>
          <el-input v-model="f.header.remark" :disabled="!editable" type="textarea" :rows="2" placeholder="备注" />
          <p v-if="f.tplNote && f.type!=='IPQC'" class="tpl-note"><Bi :zh="f.tplNote" :vi="f.tplNoteVi" /></p>
        </el-card>
      </div>

      <!-- 右侧：判定汇总 -->
      <aside class="form-side">
        <el-card shadow="never" class="panel sticky">
          <template #header><div class="panel-h"><span>判定汇总</span></div></template>

          <template v-if="f.type!=='IPQC' && f.plan">
            <div class="side-lbl"><Bi zh="抽样计划" vi="Kế hoạch rút kiểm" inline /></div>
            <el-radio-group v-model="f.header.method" size="small" :disabled="!editable" class="method" @change="recalc">
              <el-radio-button v-for="m in SAMPLING_METHODS" :key="m" :value="m">{{ m==='MIL-STD-105E II'?'105E II':m }}</el-radio-button>
            </el-radio-group>
            <div class="sum-row"><span>抽样数量 <small class="muted" v-if="f.plan.code">字码 {{ f.plan.code }}</small></span>
              <el-input-number v-if="f.plan.method==='其他'" v-model="f.header.customN" :min="1" size="small" :disabled="!editable" @change="recalc" />
              <b v-else>{{ f.plan.n ?? '—' }}</b></div>
            <table class="lv-table">
              <thead><tr><th></th><th>AQL</th><th>接收<small>Nhận</small></th><th>拒收<small>Trả về</small></th><th>缺陷</th></tr></thead>
              <tbody><tr v-for="L in LEVEL_KEYS" :key="L" :class="{rej: summary.levelReject[L]}">
                <td><LevelBadge :level="L" /></td><td>{{ f.plan.levels[L].aql }}</td>
                <td><el-input-number v-if="f.plan.method==='其他' && L!=='CR'" v-model="f.plan.levels[L].ac" :min="0" size="small" :controls="false" class="tiny" :disabled="!editable" /><template v-else>{{ f.plan.levels[L].ac ?? '—' }}</template></td>
                <td><el-input-number v-if="f.plan.method==='其他' && L!=='CR'" v-model="f.plan.levels[L].re" :min="1" size="small" :controls="false" class="tiny" :disabled="!editable" /><template v-else>{{ f.plan.levels[L].re ?? '—' }}</template></td>
                <td><b>{{ summary.levelCount.aql[L] }}</b></td>
              </tr></tbody>
            </table>
            <template v-if="f.plan.fixed">
              <div class="side-lbl">规格 / 性能（{{ f.plan.fixed.n }}PCS）</div>
              <table class="lv-table">
                <thead><tr><th></th><th>允收</th><th>缺陷</th></tr></thead>
                <tbody><tr v-for="L in LEVEL_KEYS" :key="L" :class="{rej: summary.levelCount.fixed[L] > f.plan.fixed.ac[L]}">
                  <td><LevelBadge :level="L" /></td><td>≤ {{ f.plan.fixed.ac[L] }}</td><td><b>{{ summary.levelCount.fixed[L] }}</b></td>
                </tr></tbody>
              </table>
            </template>
          </template>

          <template v-if="f.type==='IPQC'">
            <div class="sum-row"><span>巡检轮次</span><b>{{ f.rounds.length }} / {{ (f.tplPatrol&&f.tplPatrol.rounds)||6 }}</b></div>
            <div class="sum-row"><Bi zh="巡检项次合计" vi="Tổng mục tuần kiểm" inline /><b>{{ summary.patrolTotal }}</b></div>
            <div class="sum-row"><Bi zh="不良项次合计" vi="Tổng mục không đạt" inline /><b :class="{red: summary.patrolNg}">{{ summary.patrolNg }}</b></div>
            <div class="sum-row"><Bi zh="巡检不良率" vi="Tỉ lệ không đạt" inline /><b :class="{red: summary.patrolNg}">{{ summary.patrolRate }}%</b></div>
          </template>

          <div class="sum-row"><span>照片</span><b>{{ summary.photoCount }} 张</b></div>
          <div class="sum-row" v-if="summary.mainDefect"><span>不良项</span><b class="ellipsis" style="max-width:170px" :title="summary.mainDefect">{{ summary.mainDefect }}</b></div>
          <div class="verdict" :class="verdict.toLowerCase()">
            <small>{{ f.result ? '检验结果' : '系统建议判定' }}</small>{{ RESULTS[verdict].zh }}<small v-if="store.showVi">{{ RESULTS[verdict].vi }}</small>
          </div>
          <div v-if="f.ncrNo" class="sum-row"><span>不合格处理单</span><el-link type="danger" @click="go('/ncr')">{{ f.ncrNo }}</el-link></div>

          <template v-if="editable">
            <el-button class="w100" size="large" @click="saveDraft">暂存</el-button>
            <el-button class="w100 ml0" type="primary" size="large" @click="submit">提交</el-button>
          </template>
          <template v-if="canReview">
            <el-divider>审核</el-divider>
            <el-radio-group v-model="reviewResult" class="mb review-radio">
              <el-radio-button v-for="(r,k) in RESULTS" :key="k" :value="k">{{ r.zh }}</el-radio-button>
            </el-radio-group>
            <el-input v-model="reviewComment" type="textarea" :rows="2" placeholder="审核意见（退回必填）" class="mb" />
            <el-button class="w100" type="danger" plain @click="reject">退回</el-button>
            <el-button class="w100 ml0" type="success" @click="approve">审核通过</el-button>
          </template>
          <div v-if="f.reviewer && f.status==='approved'" class="muted small mt">审核：{{ f.reviewer }} {{ f.reviewedAt }}<br>{{ f.reviewComment }}</div>
        </el-card>
      </aside>
    </div>

    <div v-if="editable || canReview" class="m-actionbar show-m">
      <span class="verdict-mini" :class="summary.suggest.toLowerCase()">{{ RESULTS[summary.suggest].zh }}</span>
      <template v-if="editable"><el-button @click="saveDraft">暂存</el-button><el-button type="primary" @click="submit">提交</el-button></template>
      <template v-else><el-button type="danger" plain @click="reject">退回</el-button><el-button type="success" @click="approve">通过</el-button></template>
    </div>

    <el-dialog v-model="showErrs" title="还有以下内容未完成" width="min(480px, 92vw)">
      <ul class="err-list"><li v-for="e in errs" :key="e">{{ e }}</li></ul>
      <template #footer><el-button type="primary" @click="showErrs=false">去补充</el-button></template>
    </el-dialog>
  </div>
  <el-empty v-else description="单据不存在" />`,
};

/* ---------- 待审核 ---------- */
Pages.Review = {
  setup() { return { store, go, formSubject, formObject }; },
  computed: { rows() { return store.forms.filter(f => f.status === 'submitted'); } },
  template: `
  <div class="page">
    <div class="page-head"><h2>待审核 <el-tag round>{{ rows.length }}</el-tag></h2></div>
    <el-empty v-if="!rows.length" description="没有待审核的单据" />
    <div class="card-list review-list">
      <div v-for="f in rows" :key="f.no" class="m-card" @click="go('/form/'+f.no)">
        <div class="m-card-top"><span><TypeTag :type="f.type" /> <span class="mono">{{ f.no }}</span></span><ResultTag :result="f.result" size="sm" /></div>
        <div class="m-card-main">{{ formSubject(f) }}</div>
        <div class="m-card-sub">{{ formObject(f) }} · {{ f.docNo }}</div>
        <div class="m-card-foot"><span class="muted">{{ f.inspector }} 提交于 {{ f.submittedAt }}</span><span class="muted">照片 {{ f.photoCount }}</span></div>
      </div>
    </div>
  </div>`,
};
