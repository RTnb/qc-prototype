/* ============================================================
 * 异常处理：发现即上报、限时处理、超时升级给质量经理
 * ============================================================ */
function anomalyRows() {
  const out = [];
  store.forms.forEach(f => anomaliesOf(f).forEach(a => {
    const st = store.anomalyStatus[a.key]; if (!st) return;
    out.push({ ...a, st, date: f.date, subject: formSubject(f), object: formObject(f), inspector: f.inspector, formStatus: f.status });
  }));
  return out.sort((x, y) => y.st.reportedAt - x.st.reportedAt);
}
function durText(ms) {
  const m = Math.round(Math.abs(ms) / 60e3);
  if (m < 60) return m + ' 分钟';
  if (m < 60 * 48) return (m / 60).toFixed(m < 600 ? 1 : 0) + ' 小时';
  return Math.round(m / 1440) + ' 天';
}
function anomalyTime(st, now = Date.now()) {
  if (st.status === '已关闭') return { text: '用时 ' + durText(st.closedAt - st.reportedAt), cls: st.closedAt > st.deadline ? 'late' : 'ok' };
  if (now > st.deadline) return { text: '超时 ' + durText(now - st.deadline), cls: 'over' };
  return { text: '剩 ' + durText(st.deadline - now), cls: (st.deadline - now) < 30 * 60e3 ? 'soon' : '' };
}

Pages.Anomaly = {
  setup() { return { store, TYPES, LEVELS, ANOMALY_ACTIONS, go, srcOf }; },
  data() { return { tab: 'open', type: '', level: '', kw: store.anomalyFocus || '', now: Date.now(), dlg: false, cur: null, form: { disposition: '', action: '' } }; },
  created() { store.anomalyFocus = ''; this.timer = setInterval(() => { this.now = Date.now(); }, 30000); },
  beforeUnmount() { clearInterval(this.timer); },
  computed: {
    all() { return anomalyRows(); },
    rows() {
      return this.all.filter(r => {
        const open = r.st.status !== '已关闭', over = open && this.now > r.st.deadline;
        if (this.tab === 'open' && !open) return false;
        if (this.tab === 'overdue' && !over) return false;
        if (this.tab === 'closed' && open) return false;
        if (this.type && r.type !== this.type) return false;
        if (this.level && r.level !== this.level) return false;
        if (this.kw && ![r.no, r.item, r.subject, r.object].join(' ').includes(this.kw)) return false;
        return true;
      });
    },
    kpi() {
      const open = this.all.filter(r => r.st.status !== '已关闭');
      const month = ymd(new Date()).slice(0, 7), today = ymd(new Date());
      const closed = this.all.filter(r => r.st.closedAt && ymd(new Date(r.st.closedAt)).startsWith(month));
      const avg = closed.length ? closed.reduce((s, r) => s + (r.st.closedAt - r.st.reportedAt), 0) / closed.length : 0;
      return [
        { label: '待处理', value: open.filter(r => r.st.status === '待处理').length, warn: true },
        { label: '处理中', value: open.filter(r => r.st.status === '处理中').length },
        { label: '已超时', value: open.filter(r => this.now > r.st.deadline).length, warn: true },
        { label: '今日新发现', value: this.all.filter(r => ymd(new Date(r.st.reportedAt)) === today).length },
        { label: '本月平均处理用时', value: avg ? durText(avg) : '—' },
      ];
    },
    canHandle() { return ['supervisor', 'manager'].includes(store.role); },
  },
  methods: {
    timeText(r) { return anomalyTime(r.st, this.now); },
    fmt(ms) { return ms ? nowStr(new Date(ms)) : ''; },
    open(r) { this.cur = r; this.form = { disposition: r.st.disposition, action: r.st.action }; this.dlg = true; },
    take() {
      Object.assign(this.cur.st, { status: '处理中', handler: ROLES[store.role].user });
      addLog('接手异常', this.cur.no, this.cur.item);
      ElementPlus.ElMessage.success('已接手，状态改为「处理中」');
    },
    close() {
      if (!this.form.disposition || !this.form.action) { ElementPlus.ElMessage.warning('请选择处置方式并填写处理措施'); return; }
      const r = this.cur;
      Object.assign(r.st, { status: '已关闭', handler: r.st.handler || ROLES[store.role].user, disposition: this.form.disposition, action: this.form.action, closedAt: Date.now() });
      const f = store.forms.find(x => x.no === r.no);
      if (f && f.type === 'IPQC' && !f.problems.some(p => p.desc && p.desc.startsWith(r.item))) {
        f.problems.push({ time: r.round || hm(), desc: `${r.item}：${r.detail}`, cause: '', action: `${this.form.disposition}；${this.form.action}` });
      }
      addLog('关闭异常', r.no, `${r.item} → ${this.form.disposition}`);
      this.dlg = false;
      ElementPlus.ElMessage.success(f && f.type === 'IPQC' ? '已关闭，处理措施已写入巡检表「存在的问题」' : '已关闭');
    },
    exportCsv() {
      if (EMBEDDED) { embeddedNotice('下载 Excel 文件'); return; }
      const head = ['发现时间', '类型', '单号', '供应商/客户/车间', '物料/产品', '项目', '等级', '异常情况', '标准', '状态', '处理时限', '处理人', '处置方式', '处理措施', '关闭时间'];
      const lines = this.rows.map(r => [this.fmt(r.st.reportedAt), r.type, r.no, r.subject, r.object, r.item, r.level, r.detail, r.std, r.st.status, this.timeText(r).text, r.st.handler, r.st.disposition, r.st.action, this.fmt(r.st.closedAt)]);
      const csv = '﻿' + [head, ...lines].map(x => x.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `异常记录_${ymd(new Date())}.csv`; a.click();
    },
  },
  template: `
  <div class="page anomaly-page">
    <div class="page-head">
      <h2>异常处理 <small class="muted">发现即上报 · 限时处理：CR {{ store.settings.anomalyHours.CR }} 小时 / MAJ {{ store.settings.anomalyHours.MAJ }} 小时 / MIN {{ store.settings.anomalyHours.MIN }} 小时，超时升级给质量经理</small></h2>
      <el-button :icon="'Download'" @click="exportCsv">导出 Excel</el-button>
    </div>
    <div class="kpi-row five">
      <div v-for="k in kpi" :key="k.label" class="kpi" :class="{warn: k.warn && k.value}"><div class="kpi-label">{{ k.label }}</div><div class="kpi-value">{{ k.value }}</div></div>
    </div>
    <div class="toolbar">
      <el-radio-group v-model="tab">
        <el-radio-button value="open">未关闭</el-radio-button><el-radio-button value="overdue">已超时</el-radio-button>
        <el-radio-button value="closed">已关闭</el-radio-button><el-radio-button value="all">全部</el-radio-button>
      </el-radio-group>
      <el-select v-model="type" placeholder="检验类型" clearable style="width:120px"><el-option v-for="(t,k) in TYPES" :key="k" :label="k" :value="k" /></el-select>
      <el-select v-model="level" placeholder="等级" clearable style="width:100px"><el-option v-for="(l,k) in LEVELS" :key="k" :label="k" :value="k" /></el-select>
      <el-input v-model="kw" placeholder="单号 / 项目 / 供应商" clearable :prefix-icon="'Search'" style="width:200px" />
    </div>
    <el-empty v-if="!rows.length" description="没有符合条件的异常" />
    <div class="anomaly-list">
      <div v-for="r in rows" :key="r.key" class="an-card" :class="[timeText(r).cls, {closed: r.st.status==='已关闭'}]" @click="open(r)">
        <div class="an-photo"><img v-if="r.photo" :src="srcOf(r.photo)" alt="" /><span v-else class="muted small">无照片</span></div>
        <div class="an-main">
          <div class="an-top"><TypeTag :type="r.type" /><LevelBadge :level="r.level" /><b class="an-item">{{ r.item }}</b></div>
          <div class="an-detail">{{ r.detail }} <span v-if="r.std && r.std!=='—'" class="muted">· 标准 {{ r.std }}</span></div>
          <div class="an-meta muted">{{ r.no }} · {{ r.subject }} · {{ r.object }}</div>
          <div class="an-meta muted">{{ fmt(r.st.reportedAt) }} {{ r.st.reporter }} 上报<template v-if="r.st.handler"> · 处理人 {{ r.st.handler }}</template></div>
          <div v-if="r.st.action" class="an-action">{{ r.st.disposition }}：{{ r.st.action }}</div>
        </div>
        <div class="an-side">
          <el-tag :type="r.st.status==='已关闭'?'success':r.st.status==='处理中'?'warning':'danger'" effect="dark" size="small">{{ r.st.status }}</el-tag>
          <span class="an-time" :class="timeText(r).cls">{{ timeText(r).text }}</span>
          <span v-if="timeText(r).cls==='over'" class="an-esc">已升级：质量经理 王强</span>
        </div>
      </div>
    </div>

    <el-dialog v-model="dlg" :title="cur ? cur.item : ''" width="min(620px, 94vw)">
      <template v-if="cur">
        <div class="an-dlg">
          <img v-if="cur.photo" :src="srcOf(cur.photo)" class="an-big" alt="" />
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="异常情况"><b class="red">{{ cur.detail }}</b></el-descriptions-item>
            <el-descriptions-item label="标准">{{ cur.std }}</el-descriptions-item>
            <el-descriptions-item label="单据"><el-link type="primary" @click="dlg=false; go('/form/'+cur.no)">{{ cur.no }}</el-link> · {{ cur.subject }} · {{ cur.object }}</el-descriptions-item>
            <el-descriptions-item label="上报">{{ fmt(cur.st.reportedAt) }} · {{ cur.st.reporter }}</el-descriptions-item>
            <el-descriptions-item label="处理时限">{{ fmt(cur.st.deadline) }}（<span class="an-time" :class="timeText(cur).cls">{{ timeText(cur).text }}</span>）</el-descriptions-item>
          </el-descriptions>
        </div>
        <el-form label-position="top" class="mt" :disabled="!canHandle || cur.st.status==='已关闭'">
          <el-form-item label="处置方式"><el-radio-group v-model="form.disposition"><el-radio-button v-for="d in ANOMALY_ACTIONS[cur.type]" :key="d" :value="d">{{ d }}</el-radio-button></el-radio-group></el-form-item>
          <el-form-item label="处理措施 / 原因"><el-input v-model="form.action" type="textarea" :rows="3" placeholder="原因、已采取的措施、隔离数量、后续跟进" /></el-form-item>
        </el-form>
        <p v-if="!canHandle" class="muted small">异常由 QC 主管 / 质量经理处理；你可以在这里看到处理进度。</p>
      </template>
      <template #footer v-if="cur && canHandle && cur.st.status!=='已关闭'">
        <el-button v-if="cur.st.status==='待处理'" @click="take">接手处理</el-button>
        <el-button type="primary" @click="close">处理完成，关闭</el-button>
      </template>
    </el-dialog>
  </div>`,
};
