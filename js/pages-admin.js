/* ============================================================
 * 管理类页面：统计看板、模版管理/设计器、基础数据、系统管理
 * ============================================================ */

/* ---------- 统计分析看板 ---------- */
Pages.Analytics = {
  setup() { return { store, go }; },
  data() { return { days: 30 }; },
  computed: {
    forms() { const from = new Date(); from.setDate(from.getDate() - this.days + 1); return store.forms.filter(f => f.result && f.date >= ymd(from)); },
    kpi() {
      const r = t => { const a = this.forms.filter(f => f.type === t); return a.length ? +(a.filter(f => f.result === 'OK').length / a.length * 100).toFixed(1) : null; };
      const ip = this.forms.filter(f => f.type === 'IPQC'); const tot = ip.reduce((s, f) => s + (f.patrolTotal || 0), 0), ng = ip.reduce((s, f) => s + (f.patrolNg || 0), 0);
      const ri = r('IQC'), rf = r('FQC');
      const low = v => v !== null && v < store.settings.warnRate;   // 无数据（null）不预警
      return [
        { label: '检验单总数', value: this.forms.length, unit: '张' },
        { label: '进料批次合格率', value: ri, unit: '%', warn: low(ri) },
        { label: '巡检不良率（项次）', value: tot ? +(ng / tot * 100).toFixed(2) : 0, unit: '%' },
        { label: '成品一次合格率 FPY', value: rf, unit: '%', warn: low(rf) },
        { label: '未关闭不合格单', value: store.ncrs.filter(n => n.status !== '已关闭').length, unit: '张' },
      ];
    },
    supplierRank() {
      return MASTER.suppliers.map(s => {
        const a = this.forms.filter(f => f.type === 'IQC' && f.header.supplier === s.code);
        const ok = a.filter(f => f.result === 'OK').length;
        const rate = a.length ? ok / a.length * 100 : null;
        const ncr = store.ncrs.filter(n => n.type === 'IQC' && n.owner === s.name).length;
        const score = rate === null ? null : Math.max(0, Math.round(rate * 0.8 + 20 - ncr * 3));
        return { name: s.name, n: a.length, ok, rate: rate === null ? null : +rate.toFixed(1), ncr, score, grade: score === null ? '—' : score >= 90 ? 'A' : score >= 75 ? 'B' : 'C' };
      }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    },
    pareto() { // 不良项 Pareto：按检验项统计缺陷数
      const cnt = {};
      this.forms.forEach(f => f.items.forEach(it => { const v = f.values[it.id]; const q = defectQtyOf(it, v); if (q) { const k = itemLabel(it); cnt[k] = (cnt[k] || 0) + q; } }));
      const arr = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const total = arr.reduce((s, x) => s + x[1], 0); let acc = 0;
      return { names: arr.map(x => x[0].length > 12 ? x[0].slice(0, 12) + '…' : x[0]), vals: arr.map(x => x[1]), cum: arr.map(x => +((acc += x[1]) / total * 100).toFixed(1)) };
    },
    trend() {
      const days = []; for (let i = this.days - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(ymd(d)); }
      return { days: days.map(d => d.slice(5)), ok: days.map(d => this.forms.filter(f => f.date === d && f.result === 'OK').length), ng: days.map(d => this.forms.filter(f => f.date === d && f.result !== 'OK').length) };
    },
    stage() { // 巡检不良项次：按工段
      const names = ['蘸灯芯', '压制蜡柱', '灌装'];
      const ip = this.forms.filter(f => f.type === 'IPQC');
      return { names, vals: names.map(n => ip.reduce((s, f) => s + f.items.filter(it => it.group === n).reduce((t, it) => t + (f.values[it.id].cells || []).filter(c => cellNG(it, c)).length, 0), 0)) };
    },
    warnings() {
      const w = [];
      this.supplierRank.forEach(s => { if (s.rate !== null && s.rate < store.settings.warnRate) w.push({ level: 'danger', text: `供应商「${s.name}」进料合格率 ${s.rate}%，低于阈值 ${store.settings.warnRate}%` }); });
      const groups = {};
      [...this.forms].sort((a, b) => a.date < b.date ? 1 : -1).forEach(f => { const k = f.type === 'IQC' ? '供应商「' + supplierName(f.header.supplier) + '」' : f.type === 'IPQC' ? '「' + f.header.workshop + '」巡检' : null; if (k) (groups[k] = groups[k] || []).push(f.result); });
      Object.entries(groups).forEach(([k, rs]) => { let n = 0; for (const r of rs) { if (r !== 'OK') n++; else break; } if (n >= store.settings.warnConsecutive) w.push({ level: 'warning', text: `${k}最近连续 ${n} 次不合格` }); });
      return w;
    },
  },
  watch: { days() { this.$nextTick(this.draw); } },
  mounted() { this.charts = []; this.draw(); this._r = () => this.charts.forEach(c => c.resize()); window.addEventListener('resize', this._r); },
  beforeUnmount() { window.removeEventListener('resize', this._r); this.charts.forEach(c => c.dispose()); },
  methods: {
    chart(ref, opt) {
      const el = this.$refs[ref]; if (!el) return;
      const c = echarts.getInstanceByDom(el) || echarts.init(el);
      if (!this.charts.includes(c)) this.charts.push(c);
      c.setOption({ textStyle: { fontFamily: 'inherit' }, grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true }, tooltip: { trigger: 'axis' }, ...opt }, true);
    },
    draw() {
      const blue = '#2f6fd6', red = '#d64545', green = '#18885a', amber = '#c27a12', grid = '#e6e9ef', ink = '#5b6475';
      const axis = { axisLine: { lineStyle: { color: grid } }, axisLabel: { color: ink }, splitLine: { lineStyle: { color: grid } } };
      const sr = [...this.supplierRank].filter(s => s.rate !== null).reverse();
      this.chart('c1', {
        tooltip: { trigger: 'axis', valueFormatter: v => v + '%' },
        xAxis: { type: 'value', max: 100, ...axis }, yAxis: { type: 'category', data: sr.map(s => s.name.replace(/有限公司|制品|材料/g, '')), ...axis, splitLine: { show: false } },
        series: [{ type: 'bar', data: sr.map(s => ({ value: s.rate, itemStyle: { color: s.rate < store.settings.warnRate ? red : blue, borderRadius: [0, 4, 4, 0] } })), barMaxWidth: 18, label: { show: true, position: 'right', formatter: '{c}%', color: ink } }],
      });
      this.chart('c2', {
        legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: ink } },
        xAxis: { type: 'category', data: this.pareto.names, ...axis, axisLabel: { color: ink, interval: 0, rotate: 30 } },
        yAxis: [{ type: 'value', name: 'PCS', ...axis }, { type: 'value', max: 100, axisLabel: { formatter: '{value}%', color: ink }, splitLine: { show: false } }],
        series: [{ name: '缺陷数', type: 'bar', data: this.pareto.vals, itemStyle: { color: amber, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 28 },
          { name: '累计占比', type: 'line', yAxisIndex: 1, data: this.pareto.cum, smooth: true, symbolSize: 6, itemStyle: { color: ink } }],
      });
      this.chart('c3', {
        legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: ink } },
        xAxis: { type: 'category', data: this.trend.days, ...axis }, yAxis: { type: 'value', minInterval: 1, ...axis },
        series: [{ name: '合格', type: 'bar', stack: 'a', data: this.trend.ok, itemStyle: { color: green } }, { name: '不合格/待定', type: 'bar', stack: 'a', data: this.trend.ng, itemStyle: { color: red, borderRadius: [3, 3, 0, 0] } }],
      });
      this.chart('c4', {
        xAxis: { type: 'category', data: this.stage.names, ...axis }, yAxis: { type: 'value', minInterval: 1, ...axis },
        series: [{ type: 'bar', data: this.stage.vals, itemStyle: { color: amber, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 40, label: { show: true, position: 'top', color: ink } }],
      });
    },
  },
  template: `
  <div class="page analytics">
    <div class="page-head"><h2>统计分析</h2>
      <el-radio-group v-model="days"><el-radio-button :value="7">近 7 天</el-radio-button><el-radio-button :value="30">近 30 天</el-radio-button></el-radio-group>
    </div>
    <div class="kpi-row five">
      <div v-for="k in kpi" :key="k.label" class="kpi" :class="{warn:k.warn}"><div class="kpi-label">{{ k.label }}</div><div class="kpi-value">{{ k.value ?? '—' }}<small>{{ k.unit }}</small></div></div>
    </div>
    <el-card v-if="warnings.length" shadow="never" class="panel warn-panel">
      <template #header><div class="panel-h"><span><el-icon color="#d64545"><Warning /></el-icon> 异常预警</span><span class="muted small">规则在「系统管理 → 系统参数」配置，触发后自动推送</span></div></template>
      <div v-for="(w,i) in warnings" :key="i" class="warn-row"><el-tag :type="w.level" size="small">{{ w.level==='danger'?'低于阈值':'连续异常' }}</el-tag>{{ w.text }}</div>
    </el-card>
    <div class="grid-2">
      <el-card shadow="never" class="panel"><template #header>供应商进料批次合格率</template><div ref="c1" class="chart"></div></el-card>
      <el-card shadow="never" class="panel"><template #header>不良项 Pareto（前 10，按缺陷数）</template><div ref="c2" class="chart"></div></el-card>
      <el-card shadow="never" class="panel"><template #header>每日检验批次</template><div ref="c3" class="chart"></div></el-card>
      <el-card shadow="never" class="panel"><template #header>巡检不良项次（按工段）</template><div ref="c4" class="chart"></div></el-card>
    </div>
    <el-card shadow="never" class="panel">
      <template #header>供应商质量评分与排名</template>
      <el-table :data="supplierRank" size="small">
        <el-table-column type="index" label="排名" width="60" />
        <el-table-column prop="name" label="供应商" min-width="180" />
        <el-table-column prop="n" label="来料批次" width="90" align="right" />
        <el-table-column label="合格率" width="90" align="right"><template #default="{row}">{{ row.rate===null?'—':row.rate+'%' }}</template></el-table-column>
        <el-table-column prop="ncr" label="不合格单" width="90" align="right" />
        <el-table-column prop="score" label="评分" width="80" align="right" />
        <el-table-column label="等级" width="70"><template #default="{row}"><el-tag size="small" :type="row.grade==='A'?'success':row.grade==='B'?'warning':row.grade==='C'?'danger':'info'">{{ row.grade }}</el-tag></template></el-table-column>
      </el-table>
    </el-card>
  </div>`,
};

/* ---------- 模版管理 ---------- */
Pages.Templates = {
  setup() { return { store, TYPES, go, materialName }; },
  data() { return { type: '' }; },
  computed: { rows() { return store.templates.filter(t => !this.type || t.type === this.type); } },
  methods: {
    bindText(t) {
      const names = t.bind.materials
        .filter(code => { const m = MASTER.materials.find(x => x.code === code); return m && !m.hidden; })   // 隐藏物料不展示
        .map(materialName);
      return [...names, ...t.bind.processes].join('、') || (t.isDefault ? '默认模版' : '未绑定');
    },
    create() {
      const type = this.type || 'IQC';
      const id = `TPL-${type}-${String(store.templates.filter(t => t.type === type).length + 1).padStart(3, '0')}`;
      const base = { id, docNo: '', name: `新建${TYPES[type].short}模版`, nameVi: '', type, version: 0, status: '草稿', updatedAt: ymd(new Date()), bind: { materials: [], processes: [] }, ngPhoto: true, itemPhoto: 'all', basePhotos: [], note: '', noteVi: '' };
      if (type === 'IPQC') Object.assign(base, { patrol: { rounds: 6, perRound: 10, intervalH: 2 }, items: [I('新巡检项', 'check', { code: 'A1' })] });
      else Object.assign(base, { plan: { method: 'MIL-STD-105E II', aql: { CR: 0, MAJ: 2.5, MIN: 4.0 }, fixed: null }, items: [I('外观', 'judge', { code: 'A1', mustPhoto: true })] });
      store.templates.unshift(base);
      go('/templates/' + id);
    },
    importExcel() { ElementPlus.ElMessage.info('Excel/Word 导入：上传现有表单，自动识别检验项、等级和标准（开发阶段实现）'); },
  },
  template: `
  <div class="page">
    <div class="page-head"><h2>模版管理 <small class="muted">新增表单只需配置模版，无需改代码</small></h2>
      <div class="head-actions"><el-button :icon="'Upload'" @click="importExcel">从 Excel / Word 导入</el-button><el-button type="primary" :icon="'Plus'" @click="create">新建模版</el-button></div>
    </div>
    <div class="toolbar"><el-radio-group v-model="type"><el-radio-button value="">全部</el-radio-button><el-radio-button v-for="(t,k) in TYPES" :key="k" :value="k">{{ k }}</el-radio-button></el-radio-group></div>
    <div class="tpl-grid">
      <div v-for="t in rows" :key="t.id" class="tpl-card" @click="go('/templates/'+t.id)">
        <div class="tpl-top"><span><TypeTag :type="t.type" /> <span class="doc-no">{{ t.docNo }}</span></span><span><el-tag v-if="store.tplDrafts && store.tplDrafts[t.id]" size="small" type="warning">有草稿</el-tag> <el-tag size="small" :type="t.status==='已发布'?'success':'info'">{{ t.status }}</el-tag></span></div>
        <div class="tpl-name">{{ t.name }}</div>
        <div class="tpl-meta" v-if="store.showVi && t.nameVi">{{ t.nameVi }}</div>
        <div class="tpl-bind">{{ bindText(t) }}</div>
        <div class="tpl-foot"><span>{{ t.items.length }} 项</span>
          <span>CR {{ t.items.filter(i=>i.level==='CR').length }} · MAJ {{ t.items.filter(i=>i.level==='MAJ').length }} · MIN {{ t.items.filter(i=>i.level==='MIN').length }}</span><span>v{{ t.version }}</span></div>
      </div>
    </div>
  </div>`,
};

/* ---------- 模版设计器 ---------- */
Pages.Designer = {
  props: ['params'],
  components: { ItemField: Widgets.ItemField },
  setup() { return { store, TYPES, FIELD_TYPES, MASTER, AQL_LEVELS, LEVELS, LEVEL_KEYS, SAMPLING_METHODS, go, isPatrol, uid }; },
  data() {
    const src = store.templates.find(t => t.id === this.params.id);
    const draft = src && store.tplDrafts ? store.tplDrafts[src.id] : null;
    return { src, tpl: src ? clone(draft || src) : null, sel: null };
  },
  computed: {
    pv() { const m = {}; (this.tpl?.items || []).forEach(it => { m[it.id] = Vue.reactive(blankValue(it, 1)); }); return m; },
    /* 草稿和「已发布」比，而不是和当前编辑内容比 */
    draftBase() { return (this.src && store.tplDrafts && store.tplDrafts[this.src.id]) || this.src; },
    dirty() { return JSON.stringify(this.tpl) !== JSON.stringify(this.draftBase); },
    hasDraft() { return !!(this.src && store.tplDrafts && store.tplDrafts[this.src.id]); },
    canEdit() { return ['manager', 'admin'].includes(store.role); },
    parts() { return (this.tpl && this.tpl.parts) || null; },
    palette() { return Object.entries(FIELD_TYPES).filter(([k]) => this.tpl.type === 'IPQC' ? ['check', 'reading', 'text', 'photo'].includes(k) : !['check', 'reading', 'select'].includes(k)); },
  },
  methods: {
    add(type) {
      const last = this.tpl.items[this.tpl.items.length - 1] || {};
      const base = { measure: { std: 10, lo: 9.9, hi: 10.1, unit: 'mm' }, table: { samples: 5, sampling: 'fixed', dims: [{ name: '尺寸', key: '', pct: 3, std: 10 }] }, photo: { minPhotos: 1, level: '' }, text: { required: false, level: '' }, sign: { level: '' }, reading: { unit: '', lo: null, hi: null } }[type] || {};
      const it = I('新' + FIELD_TYPES[type].label, type, { group: last.group || '', groupVi: last.groupVi || '', part: last.part, ...base });
      this.tpl.items.push(it); this.sel = it.id;
    },
    move(i, d) { const a = this.tpl.items; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; },
    del(i) { this.tpl.items.splice(i, 1); },
    toggleFixed(on) { this.tpl.plan.fixed = on ? { n: 5, ac: { CR: 0, MAJ: 1, MIN: 1 } } : null; },
    save(publish) {
      const t = this.tpl;
      if (!store.tplDrafts) store.tplDrafts = {};
      t.updatedAt = ymd(new Date());
      if (publish) {
        t.version = (this.src.version || 0) + 1; t.status = '已发布';
        Object.assign(this.src, clone(t));          // 只有发布才覆盖已发布版本
        delete store.tplDrafts[this.src.id];        // 草稿作废
        addLog('发布模版', t.id, 'v' + t.version);
        ElementPlus.ElMessage.success(`已发布 v${t.version}；历史单据仍保留原版本，新单据按新版走`);
      } else {
        store.tplDrafts[this.src.id] = clone(t);    // 草稿单独存：不动已发布版本，新单据不会用到半成品
        addLog('保存模版草稿', t.id, '');
        ElementPlus.ElMessage.success('草稿已保存（未发布，不影响新单据用的标准）');
      }
    },
  },
  template: `
  <div class="page designer" v-if="tpl">
    <div class="page-head">
      <h2><span class="back" @click="go('/templates')"><el-icon><ArrowLeft /></el-icon></span><TypeTag :type="tpl.type" /> <span class="doc-no">{{ tpl.docNo }}</span> {{ tpl.name }} <small class="muted mono">v{{ src.version }}</small> <el-tag v-if="hasDraft" size="small" type="warning" style="margin-left:8px">草稿未发布</el-tag></h2>
      <div class="head-actions" v-if="canEdit">
        <el-button :disabled="!dirty" @click="save(false)">保存草稿</el-button>
        <el-button type="primary" :disabled="src.status==='已发布' && !dirty && !hasDraft" @click="save(true)">发布为 v{{ (src.version||0)+1 }}</el-button>
      </div>
    </div>
    <el-alert v-if="!canEdit" type="info" :closable="false" class="mb" title="模版由质量经理维护。切换右上角角色为「质量经理」可编辑。" />

    <div class="designer-layout">
      <aside class="d-left">
        <el-card shadow="never" class="panel">
          <template #header>模版属性</template>
          <el-form label-position="top" size="small" :disabled="!canEdit">
            <el-form-item label="表单编号"><el-input v-model="tpl.docNo" placeholder="如 SL/QR-35" /></el-form-item>
            <el-form-item label="模版名称"><el-input v-model="tpl.name" /></el-form-item>
            <el-form-item label="越南文名称"><el-input v-model="tpl.nameVi" /></el-form-item>
            <el-form-item v-if="tpl.type==='IQC'" label="适用物料"><el-select v-model="tpl.bind.materials" multiple collapse-tags placeholder="选择物料"><el-option v-for="m in MASTER.materials.filter(x => !x.hidden)" :key="m.code" :label="m.name" :value="m.code" /></el-select></el-form-item>
            <el-form-item label="未匹配时作为默认模版"><el-switch v-model="tpl.isDefault" /></el-form-item>
          </el-form>
        </el-card>
        <el-card shadow="never" class="panel">
          <template #header>拍照要求</template>
          <el-form label-position="top" size="small" :disabled="!canEdit">
            <el-form-item label="检验项拍照">
              <el-radio-group v-model="tpl.itemPhoto"><el-radio-button value="all">每项必拍</el-radio-button><el-radio-button value="ng">只拍不合格</el-radio-button></el-radio-group>
            </el-form-item>
            <p class="muted small" style="margin:-6px 0 10px">判不合格时一律要当场拍不良部位照片，这条不能关闭。判 NA 的项不用拍。</p>
            <el-form-item v-if="tpl.patrol" label="每轮巡检至少拍几张现场照片"><el-input-number v-model="tpl.patrol.roundPhoto" :min="0" :max="5" /></el-form-item>
            <div class="side-lbl">基础信息照片（每张单据必拍）</div>
            <div v-for="(b,i) in (tpl.basePhotos||[])" :key="i" class="bp-edit">
              <el-input v-model="b.name" placeholder="名称，如 外箱唛头" />
              <el-input v-model="b.vi" placeholder="越南文" />
              <el-input-number v-model="b.min" :min="1" :max="5" :controls="false" title="至少几张" />
              <el-button text type="danger" :icon="'Delete'" @click="tpl.basePhotos.splice(i,1)" />
            </div>
            <el-button size="small" :icon="'Plus'" @click="(tpl.basePhotos = tpl.basePhotos || []).push({ key: 'p' + uid(), name: '', vi: '', min: 1 })">添加照片位</el-button>
          </el-form>
        </el-card>
        <el-card shadow="never" class="panel" v-if="parts">
          <template #header>分段抽样（纸质表三段）</template>
          <div v-for="p in parts" :key="p.key" class="part-edit">
            <b>{{ p.code }}</b> <span class="muted small">{{ p.method }}</span>
            <div class="small">{{ p.title }}</div>
          </div>
          <p class="muted small" style="margin:8px 0 0">每段的样本数、AQL 和接收 / 拒收数由系统按抬头“来料数量（批量）”自动算，不在模版里改。</p>
        </el-card>
        <el-card shadow="never" class="panel" v-if="tpl.plan">
          <template #header>抽样计划</template>
          <el-form label-position="top" size="small" :disabled="!canEdit">
            <el-form-item label="默认方式"><el-select v-model="tpl.plan.method"><el-option v-for="m in SAMPLING_METHODS" :key="m" :label="m" :value="m" /></el-select></el-form-item>
            <div class="aql3">
              <el-form-item v-for="L in LEVEL_KEYS" :key="L" :label="L+' AQL'"><el-select v-model="tpl.plan.aql[L]"><el-option :value="0" label="0" /><el-option v-for="a in AQL_LEVELS" :key="a" :label="a" :value="a" /></el-select></el-form-item>
            </div>
            <el-form-item label="规格/性能固定抽样（如 5PCS）"><el-switch :model-value="!!tpl.plan.fixed" @change="toggleFixed" /></el-form-item>
            <template v-if="tpl.plan.fixed">
              <el-form-item label="抽样数"><el-input-number v-model="tpl.plan.fixed.n" :min="1" /></el-form-item>
              <div class="aql3"><el-form-item v-for="L in LEVEL_KEYS" :key="L" :label="L+' 允收 ≤'"><el-input-number v-model="tpl.plan.fixed.ac[L]" :min="0" :controls="false" /></el-form-item></div>
            </template>
          </el-form>
        </el-card>
        <el-card shadow="never" class="panel" v-if="tpl.patrol">
          <template #header>巡检频次</template>
          <el-form label-position="top" size="small" :disabled="!canEdit">
            <div class="aql3">
              <el-form-item label="间隔(小时)"><el-input-number v-model="tpl.patrol.intervalH" :min="0.5" :step="0.5" :controls="false" /></el-form-item>
              <el-form-item label="每次抽查"><el-input-number v-model="tpl.patrol.perRound" :min="1" :controls="false" /></el-form-item>
              <el-form-item label="每页轮次"><el-input-number v-model="tpl.patrol.rounds" :min="1" :max="12" :controls="false" /></el-form-item>
            </div>
          </el-form>
        </el-card>
        <el-card shadow="never" class="panel">
          <template #header>表底备注</template>
          <el-input v-model="tpl.note" type="textarea" :rows="3" :disabled="!canEdit" placeholder="中文" class="mb" />
          <el-input v-model="tpl.noteVi" type="textarea" :rows="3" :disabled="!canEdit" placeholder="越南文" />
        </el-card>
      </aside>

      <section class="d-mid">
        <div class="palette" v-if="canEdit">
          <button v-for="[k,f] in palette" :key="k" @click="add(k)" :title="f.desc"><el-icon><component :is="f.icon" /></el-icon>{{ f.label }}</button>
        </div>
        <div v-for="(it,i) in tpl.items" :key="it.id" class="field-row" :class="{sel: sel===it.id}" @click="sel=it.id">
          <div v-if="it.group && (i===0 || tpl.items[i-1].group!==it.group)" class="d-group">{{ it.group }} <small class="muted">{{ it.groupVi }}</small></div>
          <div class="field-sum">
            <span class="item-idx">{{ it.code || i+1 }}</span>
            <LevelBadge :level="it.level" />
            <b class="ellipsis">{{ it.name }}</b><span class="muted small">{{ FIELD_TYPES[it.type].label }}</span>
            <el-tag v-if="it.sampling==='fixed'" size="small" effect="plain">固定抽样</el-tag>
            <el-tag v-if="it.mustPhoto||it.type==='photo'" size="small" type="warning" effect="plain">必拍</el-tag>
            <span class="spacer"></span>
            <template v-if="canEdit">
              <el-button text size="small" :icon="'Top'" @click.stop="move(i,-1)" />
              <el-button text size="small" :icon="'Bottom'" @click.stop="move(i,1)" />
              <el-button text size="small" type="danger" :icon="'Delete'" @click.stop="del(i)" />
            </template>
          </div>
          <el-form v-if="sel===it.id" class="field-edit" label-position="top" size="small" :disabled="!canEdit" @click.stop>
            <div class="fe-grid">
              <el-form-item label="序号"><el-input v-model="it.code" /></el-form-item>
              <el-form-item v-if="parts" label="所属部分"><el-select v-model="it.part"><el-option v-for="p in parts" :key="p.key" :label="p.code + ' · ' + p.method" :value="p.key" /></el-select></el-form-item>
              <el-form-item label="检验员可选等级（如 MAJ/MIN）"><el-select v-model="it.levels" multiple clearable placeholder="固定等级"><el-option v-for="L in LEVEL_KEYS" :key="L" :label="L" :value="L" /></el-select></el-form-item>
              <el-form-item label="缺陷等级"><el-select v-model="it.level" clearable><el-option v-for="L in LEVEL_KEYS" :key="L" :label="L+' '+LEVELS[L].zh" :value="L" /></el-select></el-form-item>
              <el-form-item label="分组（中文）"><el-input v-model="it.group" placeholder="如 A 外箱" /></el-form-item>
              <el-form-item label="分组（越南文）"><el-input v-model="it.groupVi" /></el-form-item>
              <el-form-item label="品质要求（中文）" class="span2"><el-input v-model="it.name" /></el-form-item>
              <el-form-item label="品质要求（越南文）" class="span2"><el-input v-model="it.vi" /></el-form-item>
              <el-form-item label="说明 / 检验方法" class="span2"><el-input v-model="it.remark" /></el-form-item>
              <el-form-item v-if="tpl.plan && !isPatrol(it)" label="抽样方式"><el-select v-model="it.sampling"><el-option value="aql" label="按 AQL" /><el-option value="fixed" label="固定抽样(5PCS)" /></el-select></el-form-item>
              <template v-if="it.type==='measure' || it.type==='reading'">
                <el-form-item v-if="it.type==='measure'" label="标准值"><el-input-number v-model="it.std" :controls="false" :precision="3" /></el-form-item>
                <el-form-item label="下限"><el-input-number v-model="it.lo" :controls="false" :precision="3" /></el-form-item>
                <el-form-item label="上限"><el-input-number v-model="it.hi" :controls="false" :precision="3" /></el-form-item>
                <el-form-item label="单位"><el-input v-model="it.unit" /></el-form-item>
              </template>
              <el-form-item v-if="it.type==='table'" label="样本数"><el-input-number v-model="it.samples" :min="1" :max="50" /></el-form-item>
              <el-form-item label="必填"><el-switch v-model="it.required" /></el-form-item>
              <el-form-item v-if="it.type!=='photo'" label="必须拍照"><el-switch v-model="it.mustPhoto" /></el-form-item>
            </div>
            <div v-if="it.type==='table'" class="dims">
              <div class="dims-h">测量维度（标准值可按规格型号自动带出：填写规格字段名，如 height / mouth / wall / weight）</div>
              <div v-for="(d,j) in it.dims" :key="j" class="dim-row">
                <el-input v-model="d.name" placeholder="名称" />
                <el-input v-model="d.key" placeholder="规格字段" />
                <el-input-number v-model="d.std" :controls="false" placeholder="标准" />
                <el-input-number v-model="d.pct" :controls="false" placeholder="±%" />
                <el-button text type="danger" :icon="'Delete'" @click="it.dims.splice(j,1)" />
              </div>
              <el-button size="small" :icon="'Plus'" @click="it.dims.push({name:'尺寸',key:'',std:0,pct:3})">添加维度</el-button>
            </div>
          </el-form>
        </div>
        <el-empty v-if="!tpl.items.length" description="从上方添加字段" />
      </section>

      <aside class="d-right">
        <div class="phone">
          <div class="phone-bar">{{ tpl.docNo }} {{ tpl.name }}</div>
          <div class="phone-body">
            <ItemField v-for="(it,i) in tpl.items" :key="it.id+JSON.stringify(it)" :index="i+1" :item="it" :val="pv[it.id]" form-no="预览" inspector="检验员" preview :photo-all="tpl.itemPhoto==='all'" />
          </div>
        </div>
        <p class="muted small center">手机端实时预览</p>
      </aside>
    </div>
  </div>
  <el-empty v-else description="模版不存在" />`,
};

/* ---------- 基础数据 ---------- */
Pages.Master = {
  setup() { return { MASTER, AQL_LEVELS, LOT_RANGES, aqlPlan, supplierName, customerName }; },
  data() { return { tab: 'materials', lot: 1000, aql: 2.5, lvl: 'II' }; },
  computed: {
    plan() { return aqlPlan(this.lot, this.aql, this.lvl); },
    aqlTable() { return LOT_RANGES.map(r => ({ range: r[1] === Infinity ? `≥ ${r[0]}` : `${r[0]} ~ ${r[1]}`, code: r[2], n: r[3], plans: AQL_LEVELS.map(a => { const p = aqlPlan(r[0], a); return p ? `${p.ac}/${p.re}${p.code !== r[2] ? ' (n=' + p.n + ')' : ''}` : '—'; }) })); },
  },
  methods: {
    todo() { ElementPlus.ElMessage.info('原型：新增/编辑/Excel 导入在开发阶段实现'); },
    dimsText(d) { const n = { height: '杯高', mouth: '口径', wall: '壁厚', weight: '重量' }; return Object.entries(d || {}).map(([k, v]) => `${n[k] || k} ${v}`).join('，') || '—'; },
  },
  template: `
  <div class="page">
    <div class="page-head"><h2>基础数据</h2>
      <div class="head-actions"><el-button :icon="'Upload'" @click="todo">Excel 批量导入</el-button><el-button type="primary" :icon="'Plus'" @click="todo">新增</el-button></div>
    </div>
    <el-tabs v-model="tab">
      <el-tab-pane label="物料" name="materials">
        <el-table :data="MASTER.materials.filter(m => !m.hidden)" stripe>
          <el-table-column prop="code" label="物料编码" width="110" /><el-table-column label="名称" min-width="150"><template #default="{row}">{{ row.name }}<small class="muted" style="display:block">{{ row.vi }}</small></template></el-table-column>
          <el-table-column prop="spec" label="规格型号" min-width="160" /><el-table-column label="规格参数（自动带出标准值）" min-width="200"><template #default="{row}">{{ dimsText(row.dims) }}</template></el-table-column>
          <el-table-column prop="unit" label="单位" width="70" /><el-table-column label="默认供应商" min-width="150"><template #default="{row}">{{ supplierName(row.supplier) }}</template></el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="供应商" name="suppliers">
        <el-table :data="MASTER.suppliers" stripe><el-table-column prop="code" label="编码" width="80" /><el-table-column prop="name" label="名称" /><el-table-column prop="category" label="类别" /><el-table-column prop="contact" label="联系人" /><el-table-column prop="grade" label="等级" width="70" /></el-table>
      </el-tab-pane>
      <el-tab-pane label="产品 / 客户" name="products">
        <el-table :data="MASTER.products" stripe><el-table-column prop="code" label="产品编码" width="100" /><el-table-column prop="name" label="产品名称" /><el-table-column prop="spec" label="规格型号" /><el-table-column label="灯芯数" width="80"><template #default="{row}">{{ row.wick }}</template></el-table-column><el-table-column label="客户"><template #default="{row}">{{ customerName(row.customer) }}</template></el-table-column></el-table>
      </el-tab-pane>
      <el-tab-pane label="工段 / 车间" name="process">
        <el-descriptions :column="1" border><el-descriptions-item label="工段">{{ MASTER.processes.join('、') }}</el-descriptions-item><el-descriptions-item label="生产车间">{{ MASTER.workshops.join('、') }}</el-descriptions-item></el-descriptions>
      </el-tab-pane>
      <el-tab-pane label="缺陷代码" name="defects">
        <el-table :data="MASTER.defects" stripe><el-table-column prop="code" label="代码" width="90" /><el-table-column prop="name" label="缺陷名称" /><el-table-column label="默认等级" width="100"><template #default="{row}"><LevelBadge :level="row.level" /></template></el-table-column></el-table>
      </el-tab-pane>
      <el-tab-pane label="AQL 抽样方案" name="aql">
        <div class="aql-calc">
          <span>批量</span><el-input-number v-model="lot" :min="2" :controls="false" />
          <span>检验水平</span><el-radio-group v-model="lvl" size="small"><el-radio-button value="I">I</el-radio-button><el-radio-button value="II">II</el-radio-button></el-radio-group>
          <span>AQL</span><el-select v-model="aql" style="width:90px"><el-option v-for="a in AQL_LEVELS" :key="a" :label="a" :value="a" /></el-select>
          <span class="aql-out" v-if="plan">→ 字码 <b>{{ plan.code }}</b>，抽 <b>{{ plan.n }}</b> 件，接收 <b>{{ plan.ac }}</b> / 拒收 <b>{{ plan.re }}</b></span>
        </div>
        <p class="muted small">MIL-STD-105E（= GB/T 2828.1）一般检验水平 II，正常检验一次抽样；表中为 Ac/Re，括号内为箭头指向后的实际样本量。CR 按 AQL 0 处理：接收 0 / 拒收 1。</p>
        <div class="table-scroll">
        <el-table :data="aqlTable" size="small" border>
          <el-table-column prop="range" label="批量范围" width="130" fixed /><el-table-column prop="code" label="字码" width="60" /><el-table-column prop="n" label="样本量" width="70" />
          <el-table-column v-for="(a,i) in AQL_LEVELS" :key="a" :label="'AQL '+a" min-width="80"><template #default="{row}">{{ row.plans[i] }}</template></el-table-column>
        </el-table></div>
      </el-tab-pane>
    </el-tabs>
  </div>`,
};

/* ---------- 系统管理 ---------- */
Pages.System = {
  setup() { return { store, ROLES }; },
  data() {
    return {
      tab: 'users',
      users: [
        { name: '张伟', role: 'inspector', factory: '示例工厂（越南）', wx: true }, { name: '阮氏梅', role: 'inspector', factory: '示例工厂（越南）', wx: true },
        { name: '黄磊', role: 'inspector', factory: '示例工厂（越南）', wx: false }, { name: '李娜', role: 'supervisor', factory: '示例工厂（越南）', wx: true },
        { name: '王强', role: 'manager', factory: '全部', wx: true }, { name: 'admin', role: 'admin', factory: '全部', wx: false },
        { name: '陈静(采购)', role: 'viewer', factory: '全部', wx: true },
      ],
      perms: [
        { p: '新建/填写/拍照/提交', r: ['inspector', 'supervisor', 'manager'] },
        { p: '审核 / 退回', r: ['supervisor', 'manager'] },
        { p: '查看部门全部单据、导出', r: ['supervisor', 'manager', 'viewer'] },
        { p: '模版管理', r: ['manager', 'admin'] },
        { p: '不合格评估决策', r: ['manager', 'supervisor'] },
        { p: '统计看板', r: ['manager', 'supervisor'] },
        { p: '用户、角色、基础数据、系统参数', r: ['admin'] },
        { p: '报告与台账（授权范围只读）', r: ['viewer', 'inspector', 'supervisor', 'manager', 'admin'] },
      ],
    };
  },
  computed: { logs() { return store.logs.slice(0, 200); }, usage() { return storageUsageKB(); } },
  methods: {
    reset() { ElementPlus.ElMessageBox.confirm('将清除本机保存的所有原型数据并重新生成演示数据。', '重置演示数据', { type: 'warning' }).then(() => { resetDemo(); ElementPlus.ElMessage.success('已重置'); }).catch(() => { }); },
    backup() { exportBackup(); },
  },
  template: `
  <div class="page">
    <div class="page-head"><h2>系统管理</h2><div class="head-actions"><span class="muted small" style="margin-right:10px">本机已用 {{ usage }} KB</span><el-button @click="backup">导出备份</el-button><el-button type="danger" plain @click="reset">重置演示数据</el-button></div></div>
    <el-alert v-if="store.storageFull" type="error" :closable="false" class="mb" title="浏览器存储已满：新数据只保留在本次会话，刷新会丢。请先点「导出备份」，再清理旧单据或把照片压缩目标调小。" />
    <el-tabs v-model="tab">
      <el-tab-pane label="用户" name="users">
        <el-table :data="users" stripe>
          <el-table-column prop="name" label="姓名" /><el-table-column label="角色"><template #default="{row}">{{ ROLES[row.role].name }}</template></el-table-column>
          <el-table-column prop="factory" label="数据范围（工厂）" /><el-table-column label="企业微信/钉钉"><template #default="{row}"><el-tag size="small" :type="row.wx?'success':'info'">{{ row.wx?'已绑定':'未绑定' }}</el-tag></template></el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="角色权限" name="roles">
        <el-table :data="perms" border>
          <el-table-column prop="p" label="权限" min-width="200" />
          <el-table-column v-for="(r,k) in ROLES" :key="k" :label="r.name" align="center" width="100"><template #default="{row}"><el-icon v-if="row.r.includes(k)" color="#18885a"><Select /></el-icon></template></el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="系统参数" name="settings">
        <el-form label-width="180px" style="max-width:560px">
          <el-form-item label="合格率预警阈值"><el-input-number v-model="store.settings.warnRate" :min="50" :max="100" /> <span class="muted" style="margin-left:6px">%</span></el-form-item>
          <el-form-item label="连续不合格预警次数"><el-input-number v-model="store.settings.warnConsecutive" :min="2" :max="10" /></el-form-item>
          <el-form-item label="照片压缩目标"><el-input-number v-model="store.settings.photoMaxKB" :step="100" :min="200" /> <span class="muted" style="margin-left:6px">KB/张</span></el-form-item>
          <el-form-item label="允许从相册选取"><el-switch v-model="store.settings.allowAlbum" /><span class="muted small" style="margin-left:8px">关闭后只能现场拍照</span></el-form-item>
          <el-form-item label="检验记录保存期限"><el-input-number v-model="store.settings.keepYears" :min="1" :max="15" /> <span class="muted" style="margin-left:6px">年</span></el-form-item>
          <el-form-item label="异常处理时限（小时）"><span class="lim">CR <el-input-number v-model="store.settings.anomalyHours.CR" :min="0.5" :step="0.5" size="small" /></span><span class="lim">MAJ <el-input-number v-model="store.settings.anomalyHours.MAJ" :min="0.5" :step="0.5" size="small" /></span><span class="lim">MIN <el-input-number v-model="store.settings.anomalyHours.MIN" :min="0.5" :step="0.5" size="small" /></span></el-form-item>
          <el-form-item label="显示越南文"><el-switch v-model="store.showVi" /></el-form-item>
        </el-form>
      </el-tab-pane>
      <el-tab-pane label="操作日志" name="logs">
        <el-table :data="logs" size="small" stripe height="calc(100vh - 260px)">
          <el-table-column prop="time" label="时间" width="150" /><el-table-column prop="user" label="操作人" width="100" />
          <el-table-column prop="action" label="动作" width="120" /><el-table-column prop="target" label="对象" width="190" /><el-table-column prop="detail" label="详情" />
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="系统集成（二期）" name="integ">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="ERP：接收到货单/生产订单，回写放行状态"><el-tag type="info">二期</el-tag></el-descriptions-item>
          <el-descriptions-item label="企业微信 / 钉钉单点登录与消息推送"><el-tag type="info">可选</el-tag></el-descriptions-item>
          <el-descriptions-item label="电子秤、测温枪数据直连"><el-tag type="info">扩展</el-tag></el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>
    </el-tabs>
  </div>`,
};
