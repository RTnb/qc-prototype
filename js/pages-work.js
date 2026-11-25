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
    openAnomalies() { const now = Date.now(); return anomalyRows().filter(r => r.st.status !== '已关闭').sort((a, b) => a.st.deadline - b.st.deadline).map(r => ({ ...r, t: anomalyTime(r.st, now) })); },
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
    <el-card v-if="openAnomalies.length" shadow="never" class="panel an-home">
      <template #header><div class="panel-h"><span><el-icon color="#d64545"><BellFilled /></el-icon> 待处理异常 {{ openAnomalies.length }} 条<template v-if="openAnomalies.some(a=>a.t.cls==='over')">，<b class="red">{{ openAnomalies.filter(a=>a.t.cls==='over').length }} 条已超时</b></template></span><el-link type="primary" @click="go('/anomaly')">全部异常</el-link></div></template>
      <div v-for="a in openAnomalies.slice(0,5)" :key="a.key" class="list-row an-row" @click="go('/anomaly')">
        <TypeTag :type="a.type" /><LevelBadge :level="a.level" /><span class="ellipsis"><b>{{ a.item }}</b> <span class="muted">{{ a.detail }}</span></span>
        <span class="an-time" :class="a.t.cls">{{ a.st.status }} · {{ a.t.text }}</span>
      </div>
    </el-card>

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
  data() { return { f: null, isNew: false, reviewComment: '', reviewResult: '', errs: [], showErrs: false, busy: false, touched: false }; },
  created() { this.load(); },
  mounted() {
    // 未保存的新单：刷新 / 关标签前拦一下；应用内「返回」在 back() 里单独确认
    this._onBeforeUnload = e => { if (this.isNew && this.touched) { e.preventDefault(); e.returnValue = ''; return ''; } };
    window.addEventListener('beforeunload', this._onBeforeUnload);
  },
  beforeUnmount() { window.removeEventListener('beforeunload', this._onBeforeUnload); },
  watch: {
    baseSig() { if (this.f && this.editable) linkCoverPhotos(this.f); },
    shockSig() { this.syncShock(); },
    postSig(nv) { if (this.f && this.editable) this.onPostType(JSON.parse(nv || 'null')); },
    /* 发现异常立即上报：自动保存单据、登记异常、通知 QC 主管，不等提交 */
    anomalyKeys(nv) {
      if (!this.f || !this.editable) return;
      if (!nv) { if (!this.isNew) syncAnomalies(this.f); return; }
      if (this.isNew) { this.persist(); computeSummary(this.f); }
      const added = syncAnomalies(this.f, this.me.user);
      if (!added.length) return;
      const h = Math.min(...added.map(a => anomalyHours(a.level)));
      addLog('上报异常', this.f.no, added.map(a => a.item).join('、'));
      ElementPlus.ElNotification({
        type: 'error', duration: 8000, title: `发现异常，已记录在本机，请立即电话通知 QC 主管`,
        message: added.slice(0, 3).map(a => `${a.item}：${a.detail}`).join('；') + `。须在 ${h} 小时内处理，超时自动升级给质量经理。单据已自动保存。`,
      });
    },
  },
  computed: {
    anomalyKeys() { return this.f ? anomaliesOf(this.f).map(a => a.key).join(',') : ''; },
    openAnomalies() {
      const now = Date.now();
      if (!this.f) return [];
      return Object.entries(store.anomalyStatus).filter(([k, st]) => k.startsWith(this.f.no + '|') && st.status !== '已关闭')
        .map(([k, st]) => ({ k, ...st, overdue: now > st.deadline }));
    },
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
        if (!b || b.group !== it.group) { b = { group: it.group, vi: it.groupVi, part: it.part, items: [] }; out.push(b); }
        b.items.push(it);
      });
      return out;
    },
    judgeItems() { return this.f.items.filter(i => ['judge', 'measure', 'table'].includes(i.type)); },
    doneCount() { return this.judgeItems.filter(i => !!itemResult(i, this.f.values[i.id])).length; },
    materials() {
      const list = MASTER.materials.filter(m => !m.hidden);
      const cur = MASTER.materials.find(m => m.code === this.f.header.material && m.hidden);
      const pool = cur ? list.concat([cur]) : list;                 // 老单据已选的隐藏物料仍要能正常显示
      if (!this.f.header.supplier) return pool;
      const byS = pool.filter(m => m.supplier === this.f.header.supplier);
      return byS.length ? byS : pool;                               // 该供应商没有可见物料时别给空下拉
    },
    verdict() { return this.f.result || this.summary.suggest; },
    pool() { return allPhotos(this.f); },
    /* 表头「尺寸」与表内实测标准值不一致时当场提示（只读状态不提示） */
    sizeWarn() { return this.editable ? sizeConflict(this.f) : ''; },
    onSizeText() {
      const p = parseSizeText(this.f.header.size);
      if (!Object.keys(p).length) return;
      this.applySizeToItems(p);
    },
    /* 表头「规格型号」手改后：先反推尺寸文本，再回填标准值 */
    onSpecText() {
      const p = parseSizeText(this.f.header.spec);
      if (!Object.keys(p).length) return;
      if (p.mouth && p.height) this.f.header.size = `Φ${p.mouth}×${p.height}mm`;
      this.applySizeToItems(p);
    },
    onProduct() {
      const p = MASTER.products.find(x => x.code === this.f.header.product);
      if (!p) return;
      this.f.header.spec = p.spec;
      this.f.header.size = sizeText(p);
      resolveSpec(this.f);
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
      const sizeWarnText = sizeConflict(this.f);
      if (sizeWarnText && !this._sizeConfirmed) {
        ElementPlus.ElMessageBox.confirm(sizeWarnText + '。仍要提交吗？', '尺寸与标准值不一致', {
          type: 'warning', confirmButtonText: '仍然提交', cancelButtonText: '回去核对',
        }).then(() => { this._sizeConfirmed = true; this.submit(); }).catch(() => { });
        return;
      }
      this._sizeConfirmed = false;
      this.persist();
      Object.assign(this.f, { status: 'submitted', submittedAt: nowStr(), result: null });
      computeSummary(this.f);
      addLog('提交', this.f.no, `系统判定 ${RESULTS[this.f.result].zh}`);
      if (this.f.result === 'NG' && this.f.type === 'IPQC') ElementPlus.ElNotification({ title: '已记录在本机，请通知 QC 主管', message: `${this.f.no} 巡检发现不良`, type: 'warning' });
      ElementPlus.ElMessage.success('已提交，等待审核');
    },
    approve() {
      const f = this.f;
      if (!this.canReview || this.busy) return;   // 只有「待审核」的单能审；busy + try/finally 保证不会卡死
      this.busy = true;
      try {
        this.reviewResult = this.reviewResult || f.suggest || 'OK';   // 审核人没选时先固定，避免落库结果为空
        Object.assign(f, { result: this.reviewResult, status: 'approved', reviewer: this.me.user, reviewedAt: nowStr(), reviewComment: this.reviewComment });
        addLog('审核通过', f.no, `检验结果 ${RESULTS[f.result].zh}`);
        if (f.result !== 'OK' && !f.ncrNo) {
          // NCR 编号取「已有最大流水 + 1」，不再用 ncrs.length+1（删过数据会重号）
          const seq = store.ncrs.reduce((m, x) => { const mm = /-(\d+)$/.exec(x.no || ''); return mm ? Math.max(m, +mm[1]) : m; }, 0);
          const n = { no: `NCR-${ymdCompact(new Date())}-${pad(seq + 1, 3)}`, formNo: f.no, type: f.type, createdAt: ymd(new Date()), desc: (f.result === 'HOLD' ? '待定：' : '') + (f.mainDefect || '检验不合格'), disposition: '', owner: f.type === 'IQC' ? supplierName(f.header.supplier) : (f.header.workshop || '生产部'), action: '', confirmer: '', status: '待处置', closedAt: '' };
          store.ncrs.unshift(n); f.ncrNo = n.no;
          ElementPlus.ElNotification({ title: '已自动生成不合格处理单', message: n.no, type: 'warning' });
        }
        ElementPlus.ElMessage.success('审核通过，已生成报告与台账记录');
        go('/report/' + f.no);
      } catch (e) {
        ElementPlus.ElMessage.error('审核失败：' + (e && e.message ? e.message : '未知错误'));
      } finally {
        this.busy = false;
      }
    },
    reject() {
      if (!this.canReview || this.busy) return;
      if (!this.reviewComment) { ElementPlus.ElMessage.warning('退回请填写审核意见'); return; }
      this.busy = true;
      try {
        Object.assign(this.f, { status: 'returned', reviewer: this.me.user, reviewComment: this.reviewComment, result: null });
        addLog('退回', this.f.no, this.reviewComment);
        ElementPlus.ElMessage.success('已退回检验员');
      } catch (e) {
        ElementPlus.ElMessage.error('退回失败：' + (e && e.message ? e.message : '未知错误'));
      } finally {
        this.busy = false;
      }
    },
  },
  template: `
  <div class="page form-page" v-if="f" @input="markTouched" @change="markTouched">
    <div class="page-head">
      <h2><span class="back" @click="back"><el-icon><ArrowLeft /></el-icon></span><TypeTag :type="f.type" /> {{ isNew ? '新建' + t.short + (f.type==='IPQC'?'表':'检验单') : f.no }}</h2>
      <div class="head-actions">
        <StatusTag v-if="!isNew" :status="f.status" />
        <el-button v-if="f.status==='approved'" :icon="'Document'" @click="go('/report/'+f.no)">查看报告</el-button>
      </div>
    </div>
    <FlowSteps :status="isNew?'draft':f.status" :result="f.result" class="hide-m" />
    <el-alert v-if="openAnomalies.length" type="error" :closable="false" show-icon class="mb anomaly-banner">
      <template #title>本单有 {{ openAnomalies.length }} 条异常未关闭<template v-if="openAnomalies.some(a=>a.overdue)">，其中 {{ openAnomalies.filter(a=>a.overdue).length }} 条已超时</template>
        <el-link type="danger" style="margin-left:8px" @click="store.anomalyFocus=f.no; go('/anomaly')">查看处理进度 →</el-link></template>
    </el-alert>
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
              <el-form-item required><template #label><Bi zh="订单号" vi="Số đơn hàng" inline /></template><el-input v-model="f.header.order" placeholder="可扫码" /></el-form-item>
              <el-form-item required><template #label><Bi zh="货号 / 物料" vi="Mã hàng / nguyên liệu" inline /></template>
                <el-select v-model="f.header.material" filterable placeholder="选择玻璃杯（自动带出尺寸、模版和标准）" @change="onMaterial"><el-option v-for="m in materials" :key="m.code" :label="m.name" :value="m.code" /></el-select></el-form-item>
              <el-form-item required><template #label><Bi zh="供应商" vi="Nhà cung cấp" inline /></template>
                <el-select v-model="f.header.supplier" filterable placeholder="选择供应商" @change="onSupplier"><el-option v-for="s in MASTER.suppliers" :key="s.code" :label="s.name" :value="s.code" /></el-select></el-form-item>
              <el-form-item><template #label><Bi zh="尺寸" vi="Kích thước" inline /></template><el-input v-model="f.header.size" placeholder="如 Φ78×85mm" @change="onSizeText" /><div v-if="sizeWarn" class="size-warn">⚠ {{ sizeWarn }}</div></el-form-item>
              <el-form-item required><template #label><Bi zh="来料数量（批量）" vi="Số lượng nhập (lô)" inline /></template><el-input-number v-model="f.header.qty" :min="0" :controls="false" @change="recalc" style="width:100%" /></el-form-item>
              <el-form-item><template #label><Bi zh="到货日期" vi="Ngày nhập hàng" inline /></template><el-date-picker v-model="f.header.receiveDate" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
              <el-form-item><template #label><Bi zh="检验日期" vi="Ngày kiểm tra" inline /></template><el-input :model-value="f.date" disabled /></el-form-item>
              <el-form-item><template #label><Bi zh="检验员" vi="Nhân viên kiểm tra" inline /></template><el-input :model-value="f.inspector" disabled /></el-form-item>
              <el-form-item><template #label><Bi zh="检验状态" vi="Trạng thái kiểm tra" inline /></template>
                <el-radio-group v-model="f.header.visit"><el-radio-button value="首次">首次</el-radio-button><el-radio-button value="复验">复验</el-radio-button></el-radio-group></el-form-item>
              <el-form-item><template #label><Bi zh="规格型号" vi="Mã quy cách" inline /></template><el-input v-model="f.header.spec" @change="onSpecText" /></el-form-item>
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
              <el-form-item required><template #label><Bi zh="订单号" vi="Số đơn hàng" inline /></template><el-input v-model="f.header.order" /></el-form-item>
              <el-form-item required><template #label><Bi zh="货号" vi="Mã hàng" inline /></template>
                <el-select v-model="f.header.product" @change="onProduct" placeholder="选择货号（自动带出尺寸和标准）"><el-option v-for="p in MASTER.products" :key="p.code" :label="p.itemNo+' '+p.name" :value="p.code" /></el-select></el-form-item>
              <el-form-item><template #label><Bi zh="尺寸" vi="Kích thước" inline /></template><el-input v-model="f.header.size" placeholder="如 Φ78×85mm" @change="onSizeText" /><div v-if="sizeWarn" class="size-warn">⚠ {{ sizeWarn }}</div></el-form-item>
              <el-form-item><template #label><Bi zh="订单数量" vi="Số lượng đơn hàng" inline /></template><el-input-number v-model="f.header.orderQty" :min="0" :controls="false" style="width:100%" /></el-form-item>
              <el-form-item required><template #label><Bi zh="验货数量" vi="Số lượng kiểm hàng" inline /></template><el-input-number v-model="f.header.qty" :min="0" :controls="false" @change="recalc" style="width:100%" /></el-form-item>
              <el-form-item><template #label><Bi zh="检验日期" vi="Ngày kiểm tra" inline /></template><el-input :model-value="f.date" disabled /></el-form-item>
              <el-form-item><template #label><Bi zh="验货员" vi="Nhân viên kiểm hàng" inline /></template><el-input :model-value="f.inspector" disabled /></el-form-item>
              <el-form-item><template #label><Bi zh="验货状态" vi="Trạng thái kiểm hàng" inline /></template>
                <el-radio-group v-model="f.header.visit"><el-radio-button value="首次">首次</el-radio-button><el-radio-button value="复验">复验</el-radio-button></el-radio-group></el-form-item>
            </template>
          </el-form>
        </el-card>

        <!-- 基础信息照片：每张单据必拍，合格也要拍 -->
        <el-card v-if="f.basePhotoDefs && f.basePhotoDefs.length" shadow="never" class="panel">
          <template #header><div class="panel-h"><Bi :zh="f.plans ? '来料照片' : '基础信息照片'" :vi="f.plans ? 'Hình ảnh hàng nhập' : 'Hình ảnh thông tin cơ bản'" inline />
            <span class="muted small">合格也要拍；拍完自动用到对应的检验项，不用重复拍</span></div></template>
          <template v-for="g in baseGroups" :key="g.name">
            <div v-if="g.name" class="bp-group"><Bi :zh="g.name" :vi="g.vi" inline /></div>
            <div class="base-photos">
              <div v-for="d in g.defs" :key="d.key" class="bp-slot" :class="{lack: (f.basePhotos[d.key]||[]).length < d.min}">
                <div class="bp-name"><Bi :zh="d.no + '. ' + d.name" :vi="d.vi" /><small class="muted">至少 {{ d.min }} 张</small></div>
                <div v-if="d.hint" class="bp-hint">{{ d.hint }}</div>
                <PhotoCell :photos="f.basePhotos[d.key]" :item-name="d.name" :form-no="f.no" :inspector="f.inspector" :readonly="!editable" :min="d.min" :pool="pool" />
                <div v-if="d.covers && d.covers.length" class="bp-covers">自动用于：{{ d.covers.join('、') }}</div>
              </div>
            </div>
          </template>
        </el-card>

        <!-- 进料 / 成品：检验项目 -->
        <template v-if="f.type!=='IPQC'">
          <div class="items-head">
            <h3><Bi zh="检验项目" :vi="f.type==='IQC'?'Nội dung kiểm tra':'Hạng mục rút kiểm'" inline /></h3>
            <span class="muted">已判定 {{ doneCount }} / {{ judgeItems.length }}</span>
            <span v-if="f.itemPhoto==='all'" class="photo-rule">每项都要拍照（NA 除外）</span>
            <span class="spacer"></span>
            <el-button v-if="editable" size="small" @click="allOk">未判定的全部 OK</el-button>
          </div>
          <div v-for="(b,i) in blocks" :key="b.group" class="item-block">
            <div v-if="f.plans && b.part && (i===0 || blocks[i-1].part !== b.part)" class="part-h">
              <Bi :zh="partInfo(b.part).title" :vi="partInfo(b.part).titleVi" />
              <span v-if="!partInfo(b.part).single" class="part-n">
                抽 {{ (f.plans[b.part]||{}).n ?? '—' }} 只（字码 {{ (f.plans[b.part]||{}).code || '—' }}）
                · AQL CR 0 / MAJ 2.5 / MIN 2.5
              </span>
              <span v-else class="part-n">单项判定：任一项不合格整批拒收</span>
            </div>
            <div v-if="b.group" class="block-h"><Bi :zh="b.group" :vi="b.vi" inline /></div>
            <div class="items">
              <ItemField v-for="(it,j) in b.items" :key="it.id" :index="j+1" :item="it" :val="f.values[it.id]" :readonly="!editable" :form-no="f.no" :inspector="f.inspector" :ng-photo="f.ngPhoto" :photo-all="f.itemPhoto==='all'" :pool="pool" />
            </div>
          </div>

          <!-- 第三部分：热冲击补充记录（每只单独判定） -->
          <el-card v-if="f.shock" shadow="never" class="panel">
            <template #header><div class="panel-h">
              <Bi zh="热冲击补充记录（每只单独判定；温度 / 时间按指导书或工艺单填写）" vi="Ghi thêm sốc nhiệt (phán định từng ly)" inline />
              <span class="muted small">任一只不合格 → D1 判 NG，整批拒收</span></div></template>
            <div class="shock-method">
              <span class="side-lbl" style="margin:0">方法 / 依据 <small class="muted">Phương pháp</small></span>
              <el-input v-model="f.shock.method" :disabled="!editable" placeholder="如 GB/T 6578 / 工艺单编号" style="max-width:340px" size="small" />
            </div>
            <table class="shock-table">
              <thead><tr><th style="width:56px">样品<small>Mẫu</small></th><th style="width:150px">结果（合格 / 不合格）<small>Kết quả</small></th><th>现象（裂 / 渗漏等）<small>Hiện tượng</small></th><th style="width:130px">工艺浇注温度 ℃<small>Nhiệt độ rót</small></th><th style="width:120px">实测温度 ℃<small>Nhiệt đo</small></th><th style="width:150px">备注<small>Ghi chú</small></th></tr></thead>
              <tbody>
                <tr v-for="(r,k) in f.shock.rows" :key="k" :class="{ng: r.ok==='NG'}">
                  <td class="c">{{ k+1 }}</td>
                  <td class="c"><el-select v-model="r.ok" :disabled="!editable" size="small" style="width:120px"><el-option value="OK" label="合格" /><el-option value="NG" label="不合格" /></el-select></td>
                  <td><el-input v-model="r.phenomenon" :disabled="!editable" size="small" placeholder="无 / 裂纹 / 渗漏" /></td>
                  <td class="c"><el-input-number v-model="r.pourTemp" :disabled="!editable" size="small" :controls="false" class="tiny" /></td>
                  <td class="c"><el-input-number v-model="r.temp" :disabled="!editable" size="small" :controls="false" class="tiny" /></td>
                  <td><el-input v-model="r.note" :disabled="!editable" size="small" /></td>
                </tr>
              </tbody>
            </table>
          </el-card>
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

          <!-- 三段式来料表：每段各自的抽样数、AQL 和缺陷累计 -->
          <template v-if="f.plans">
            <div v-for="p in f.tplParts" :key="p.key" class="part-sum">
              <div class="side-lbl"><Bi :zh="p.short || p.title" :vi="p.shortVi || p.titleVi" inline /></div>
              <template v-if="!p.single">
                <div class="sum-row"><span>抽样数量 <small class="muted" v-if="f.plans[p.key].code">字码 {{ f.plans[p.key].code }}</small></span><b>{{ f.plans[p.key].n ?? '—' }}</b></div>
                <table class="lv-table">
                  <thead><tr><th></th><th>AQL</th><th>接收</th><th>拒收</th><th>缺陷</th></tr></thead>
                  <tbody><tr v-for="L in LEVEL_KEYS" :key="L" :class="{rej: summary.levelReject[p.key] && summary.levelReject[p.key][L]}">
                    <td><LevelBadge :level="L" /></td><td>{{ f.plans[p.key].levels[L].aql }}</td>
                    <td>{{ f.plans[p.key].levels[L].ac ?? '—' }}</td><td>{{ f.plans[p.key].levels[L].re ?? '—' }}</td>
                    <td><b>{{ summary.levelCount.parts[p.key][L] }}</b></td>
                  </tr></tbody>
                </table>
              </template>
              <template v-else>
                <div class="sum-row"><span>单项判定</span>
                  <b :class="{red: summary.levelCount.parts[p.key].ng}">{{ summary.levelCount.parts[p.key].ng ? summary.levelCount.parts[p.key].ng + ' 项不合格' : '全部合格' }}</b></div>
              </template>
            </div>
          </template>

          <template v-if="f.type!=='IPQC' && f.plan">
            <div class="side-lbl"><Bi zh="抽样计划" vi="Kế hoạch rút kiểm" inline /></div>
            <el-radio-group v-model="f.header.method" size="small" :disabled="!editable" class="method" @change="recalc">
              <el-radio-button v-for="m in SAMPLING_METHODS" :key="m" :value="m">{{ m.startsWith('MIL') ? m.replace('MIL-STD-', '') : m }}</el-radio-button>
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
              <div class="side-lbl">实测项目（固定抽 {{ f.plan.fixed.n }}PCS：尺寸、重量等）</div>
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

          <div class="sum-row"><span>照片</span><b>{{ summary.photoCount }} 张<small v-if="editable && photoProgress" class="red">（{{ photoProgress }} 处缺照片）</small></b></div>
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
