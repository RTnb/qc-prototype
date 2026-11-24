/* ============================================================
 * 报告与台账：一单一行台账、检验报告（按公司表单排版）、批次追溯、不合格处理
 * ============================================================ */

/* ---------- 检验台账（一单一行） ---------- */
Pages.Ledger = {
  setup() { return { store, TYPES, MASTER, RESULTS, go, formSubject, formObject }; },
  data() { return { type: '', result: '', range: null, kw: '', supplier: '' }; },
  computed: {
    rows() {
      return store.forms.filter(f => f.status !== 'draft'
        && (!this.type || f.type === this.type)
        && (!this.result || f.result === this.result)
        && (!this.supplier || f.header.supplier === this.supplier)
        && (!this.range || (f.date >= ymd(this.range[0]) && f.date <= ymd(this.range[1])))
        && (!this.kw || [f.no, f.header.order, f.header.lot, f.inspector, formSubject(f), formObject(f)].join(' ').includes(this.kw)));
    },
    total() { const r = this.rows.filter(f => f.result); return { n: r.length, ok: r.filter(f => f.result === 'OK').length, ng: r.filter(f => f.result !== 'OK').length }; },
  },
  methods: {
    qty(f) { return f.type === 'IPQC' ? f.header.orderQty : f.header.qty; },
    n(f) { return f.type === 'IPQC' ? f.rounds.reduce((s, r) => s + (Number(r.qty) || 0), 0) : (f.plan && f.plan.n); },
    lv(f, L) { return f.levelCount ? f.levelCount.total[L] : 0; },
    rate(f) { if (f.type === 'IPQC') return f.patrolRate + '%'; const n = this.n(f); return n ? (f.defects / n * 100).toFixed(1) + '%' : '—'; },
    exportCsv() {
      if (EMBEDDED) { embeddedNotice('下载 Excel 文件'); return; }
      const head = ['单号', '表单编号', '类型', '日期', '供应商/客户/车间', '物料/产品', '规格型号', '订单号', '数量', '抽样数', 'CR', 'MAJ', 'MIN', '不良率', '检验结果', '不良项', '检验员', '审核人', '照片数', '处置', '状态'];
      const lines = this.rows.map(f => [f.no, f.docNo, f.type, f.date, formSubject(f), formObject(f), f.header.spec, f.header.order, this.qty(f) ?? '', this.n(f) ?? '', this.lv(f, 'CR'), this.lv(f, 'MAJ'), this.lv(f, 'MIN'), this.rate(f), f.result ? RESULTS[f.result].zh : '', f.mainDefect, f.inspector, f.reviewer, f.photoCount, f.ncrResult || '', STATUS[f.status].label]);
      const csv = '﻿' + [head, ...lines].map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `检验台账_${ymd(new Date())}.csv`; a.click();
      ElementPlus.ElMessage.success(`已导出 ${lines.length} 行（Excel 可直接打开）`);
    },
  },
  template: `
  <div class="page">
    <div class="page-head">
      <h2>检验台账 <small class="muted">一单一行 · {{ total.n }} 张 · 合格 {{ total.ok }} · 不合格/待定 <span class="red">{{ total.ng }}</span></small></h2>
      <div class="head-actions"><el-button :icon="'Connection'" @click="go('/trace')">批次追溯</el-button><el-button type="primary" :icon="'Download'" @click="exportCsv">导出 Excel</el-button></div>
    </div>
    <div class="toolbar wrap">
      <el-select v-model="type" placeholder="检验类型" clearable style="width:130px"><el-option v-for="(t,k) in TYPES" :key="k" :label="k" :value="k" /></el-select>
      <el-select v-model="result" placeholder="检验结果" clearable style="width:120px"><el-option v-for="(r,k) in RESULTS" :key="k" :label="r.zh" :value="k" /></el-select>
      <el-select v-model="supplier" placeholder="供应商" clearable filterable style="width:200px"><el-option v-for="s in MASTER.suppliers" :key="s.code" :label="s.name" :value="s.code" /></el-select>
      <el-date-picker v-model="range" type="daterange" start-placeholder="开始" end-placeholder="结束" style="width:250px" />
      <el-input v-model="kw" placeholder="单号/订单号/检验员" clearable :prefix-icon="'Search'" style="width:200px" />
    </div>
    <el-table :data="rows" stripe border size="small" @row-click="r=>go('/report/'+r.no)" row-class-name="clickable" height="calc(100vh - 240px)">
      <el-table-column label="单号" width="170" fixed><template #default="{row}"><span class="mono">{{ row.no }}</span></template></el-table-column>
      <el-table-column label="类型" width="64"><template #default="{row}"><TypeTag :type="row.type" /></template></el-table-column>
      <el-table-column prop="date" label="日期" width="100" sortable />
      <el-table-column label="供应商/客户/车间" min-width="170" show-overflow-tooltip><template #default="{row}">{{ formSubject(row) }}</template></el-table-column>
      <el-table-column label="物料/产品" min-width="170" show-overflow-tooltip><template #default="{row}">{{ formObject(row) }}</template></el-table-column>
      <el-table-column label="规格型号" min-width="150" show-overflow-tooltip><template #default="{row}">{{ row.header.spec }}</template></el-table-column>
      <el-table-column label="数量" width="70" align="right"><template #default="{row}">{{ qty(row) ?? '—' }}</template></el-table-column>
      <el-table-column label="抽样" width="60" align="right"><template #default="{row}">{{ n(row) ?? '—' }}</template></el-table-column>
      <el-table-column label="CR" width="50" align="center"><template #default="{row}"><b v-if="lv(row,'CR')" class="red">{{ lv(row,'CR') }}</b></template></el-table-column>
      <el-table-column label="MAJ" width="54" align="center"><template #default="{row}">{{ lv(row,'MAJ') || '' }}</template></el-table-column>
      <el-table-column label="MIN" width="54" align="center"><template #default="{row}">{{ lv(row,'MIN') || '' }}</template></el-table-column>
      <el-table-column label="不良率" width="72" align="right"><template #default="{row}">{{ rate(row) }}</template></el-table-column>
      <el-table-column label="结果" width="80"><template #default="{row}"><ResultTag :result="row.result" size="sm" /></template></el-table-column>
      <el-table-column prop="mainDefect" label="不良项" min-width="160" show-overflow-tooltip />
      <el-table-column prop="inspector" label="检验员" width="70" />
      <el-table-column prop="reviewer" label="审核人" width="70" />
      <el-table-column prop="photoCount" label="照片" width="56" align="right" />
      <el-table-column label="处置" width="100" show-overflow-tooltip><template #default="{row}">{{ row.ncrResult || (row.ncrNo ? '处理中' : '') }}</template></el-table-column>
      <el-table-column label="状态" width="80"><template #default="{row}"><StatusTag :status="row.status" /></template></el-table-column>
    </el-table>
  </div>`,
};

/* ---------- 检验报告：按公司现行表单排版 ---------- */
Pages.Report = {
  props: ['params'],
  setup() { return { store, MASTER, LEVELS, LEVEL_KEYS, RESULTS, DISPOSITIONS, SAMPLING_METHODS, go, supplierName, materialName, customerName, defectName, isPatrol }; },
  computed: {
    f() { return store.forms.find(x => x.no === this.params.no); },
    ncr() { return this.f && store.ncrs.find(n => n.no === this.f.ncrNo); },
    title() { return { IQC: ['进料检验报告', 'BÁO CÁO KIỂM TRA NGUYÊN LIỆU ĐẦU VÀO'], IPQC: ['杯蜡在线巡检稽查表', 'BẢNG KIỂM TRA TUẦN KIỂM SÁP LY TRÊN CHUYỀN'], FQC: ['成品检验报告', 'BÁO CÁO KIỂM NGHIỆM THÀNH PHẨM'] }[this.f.type]; },
    info() {
      const f = this.f, h = f.header;
      if (f.type === 'IQC') return [[['供应商', 'Nhà cung ứng', supplierName(h.supplier)], ['物料名称', 'Tên nguyên vật liệu', materialName(h.material)], ['规格型号', 'Mã quy cách', h.spec]],
        [['来料数量', 'Số lượng nhập', h.qty], ['接收日期', 'Ngày tiếp nhận', h.receiveDate], ['检验日期', 'Ngày kiểm tra', f.date]],
        [['订单号', 'Số PO', h.order], ['批号', 'Số lô', h.lot], ['报告编号', 'Số báo cáo', f.no]]];
      if (f.type === 'FQC') {
        const prod = MASTER.products.find(x => x.code === h.product) || {};
        return [[['订单号', 'Số đơn hàng', h.order], ['货号', 'Mã hàng', prod.itemNo ? `${prod.itemNo} ${prod.name}` : '']],
          [['尺寸', 'Kích thước', h.size], ['订单数量', 'Số lượng đơn hàng', h.orderQty]],
          [['验货数量', 'Số lượng kiểm hàng', h.qty], ['检验日期', 'Ngày kiểm tra', f.date]],
          [['验货员', 'Nhân viên kiểm hàng', f.inspector], ['验货结论', 'Kết luận kiểm hàng', f.result ? RESULTS[f.result].zh : '']],
          [['验货状态', 'Trạng thái kiểm hàng', h.visit === '复验' ? '□ 首次　☑ 复验' : '☑ 首次　□ 复验'], ['报告编号', 'Số báo cáo', f.no]]];
      }
      return [[['产品名称', 'Tên sản phẩm', materialName(h.product)], ['订单号/货号', 'Số đơn đặt/số hàng', h.order], ['订单数量', 'Số lượng đơn đặt', h.orderQty]],
        [['生产车间', 'Xưởng sản xuất', h.workshop], ['日期', 'Ngày tháng', f.date], ['页次', 'Trang', h.page]],
        [['室内温度', 'Nhiệt độ trong phòng', filled(h.temp) ? h.temp + ' ℃' : ''], ['室内潮湿度', 'Độ ẩm trong phòng', filled(h.humidity) ? h.humidity + ' %' : ''], ['InlineQC / 审核', 'Xét duyệt', `${f.inspector} / ${f.reviewer || '—'}`]]];
    },
    rows() {
      const out = []; let g = null;
      this.f.items.filter(i => !isPatrol(i) && !['sign', 'photo', 'text'].includes(i.type)).forEach(it => {
        const v = this.f.values[it.id], res = itemResult(it, v);
        if (it.other && !v.judge) return;
        if (it.group && it.group !== g) { g = it.group; out.push({ head: true, name: it.group, vi: it.groupVi }); }
        let result = res || '—';
        if (it.type === 'table') result = tableStats(it, v.rows).map((s, j) => `${it.dims[j].name} ${s.min}~${s.max}`).join('；') + (res ? `（${res}）` : '');
        if (it.type === 'measure') result = `${v.value ?? '—'} ${it.unit}（${res}）`;
        if (v.note) result += `：${v.note}`;
        if (v.defect) result += `［${defectName(v.defect)}］`;
        out.push({ code: it.code, level: v.level || it.level, lvText: it.levels ? it.levels.join('/') : it.level,
          name: it.other ? `其他${v.otherName ? '：' + v.otherName : ''}` : it.name, vi: it.vi, std: it.other ? '' : it.remark, stdVi: it.other ? '' : it.remarkVi,
          result, res, qty: res === 'NG' ? itemQty(it, v) : 0, fixed: it.sampling === 'fixed', photos: v.photos || [] });
      });
      return out;
    },
    lc() { return this.f.levelCount || summarize(this.f).levelCount; },
    patrolGroups() {
      const out = [];
      this.f.items.filter(isPatrol).forEach(it => { let g = out[out.length - 1]; if (!g || g.name !== it.group) { g = { name: it.group, vi: it.groupVi, items: [] }; out.push(g); } g.items.push(it); });
      return out;
    },
    slots() { return Array.from({ length: Math.max(6, this.f.rounds.length) }, (_, k) => this.f.rounds[k] || null); },
    baseGroups() { return (this.f.basePhotoDefs || []).map((d, i) => ({ no: i + 1, name: d.name, vi: d.vi, group: d.group || '', groupVi: d.groupVi || '', photos: this.f.basePhotos[d.key] || [] })); },
    baseSections() {
      const out = [];
      this.baseGroups.forEach(g => { let s = out[out.length - 1]; if (!s || s.name !== g.group) { s = { name: g.group, vi: g.groupVi, items: [] }; out.push(s); } s.items.push(g); });
      return out;
    },
    roundGroups() { return (this.f.rounds || []).map((r, k) => ({ name: `第 ${k + 1} 轮 ${r.time}`, photos: r.photos || [] })).filter(g => g.photos.length); },
    defectPhotos() { const out = []; this.f.items.forEach(i => (this.f.values[i.id].photos || []).filter(p => p.defect).forEach(p => out.push({ name: itemLabel(i), p }))); return out; },
    allSrc() { return allPhotos(this.f).map(srcOf); },
    signItem() { const s = this.f.items.find(i => i.type === 'sign'); return s ? this.f.values[s.id].sign : ''; },
    qrCells() {
      let s = 0; for (const c of this.f.no) s = (s * 31 + c.charCodeAt(0)) % 9973;
      return Array.from({ length: 21 * 21 }, (_, i) => { const x = i % 21, y = Math.floor(i / 21); const fd = (a, b) => a < 7 && b < 7 && (a % 6 === 0 || b % 6 === 0 || (a > 1 && a < 5 && b > 1 && b < 5)); if (fd(x, y) || fd(20 - x, y) || fd(x, 20 - y)) return true; if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) return false; s = (s * 1103 + 7) % 9973; return s % 2 === 0; });
    },
  },
  methods: {
    srcOf,
    print() { if (EMBEDDED) { embeddedNotice('打印或另存 PDF'); return; } window.print(); },
    back() { history.length > 1 ? history.back() : go('/ledger'); },
    box(on) { return on ? '☑' : '☐'; },
    cellText(it, k) { const c = this.f.values[it.id].cells[k]; if (!cellFilled(it, c)) return ''; return it.type === 'check' ? (c.v === 'OK' ? '✓' : '✗') : c.v + (c.ng ? ' ✗' : ''); },
    cellBad(it, k) { return cellNG(it, this.f.values[it.id].cells[k]); },
  },
  template: `
  <div class="page report-page" v-if="f">
    <div class="page-head no-print">
      <h2><span class="back" @click="back"><el-icon><ArrowLeft /></el-icon></span>检验报告</h2>
      <div class="head-actions">
        <el-button :icon="'View'" @click="go('/form/'+f.no)">查看原始单据</el-button>
        <el-button type="primary" :icon="'Printer'" @click="print">打印 / 下载 PDF</el-button>
      </div>
    </div>
    <el-alert v-if="f.status!=='approved'" type="warning" :closable="false" class="no-print mb" title="单据尚未审核，以下为报告预览；审核通过后正式出具。" />

    <div class="sheet" :class="{landscape: f.type==='IPQC'}">
      <div class="sheet-head">
        <div class="logo">{{ MASTER.company }}</div>
        <div class="sheet-title"><h1>{{ title[0] }}</h1><p>{{ title[1] }}</p></div>
        <div class="qr"><div class="qr-grid"><i v-for="(c,i) in qrCells" :key="i" :class="{on:c}"></i></div><small>{{ f.docNo }}</small></div>
      </div>

      <table class="info-table">
        <tr v-for="(row,i) in info" :key="i"><template v-for="c in row" :key="c[0]"><th>{{ c[0] }}<small>{{ c[1] }}</small></th><td>{{ c[2] ?? '' }}</td></template></tr>
      </table>

      <!-- 进料 / 成品 -->
      <template v-if="f.type!=='IPQC'">
        <table class="plan-table" v-if="f.plan">
          <tr>
            <th rowspan="2" class="l">抽样计划 <small>Kế hoạch rút kiểm</small>
              <div class="methods"><span v-for="m in SAMPLING_METHODS" :key="m">{{ box(f.plan.method===m) }} {{ m==='全检'?'全检 Kiểm toàn bộ':m==='其他'?'其他抽样计划':m }}</span></div></th>
            <th rowspan="2">抽样数量<small>Số lượng rút kiểm</small><b class="big">{{ f.plan.n ?? '' }}</b></th>
            <th v-for="L in LEVEL_KEYS" :key="L" colspan="2">{{ L }} {{ LEVELS[L].zh }}（{{ f.plan.levels[L].aql }}）<small>{{ LEVELS[L].vi }}</small></th>
          </tr>
          <tr><template v-for="L in LEVEL_KEYS" :key="L"><td>接收 {{ f.plan.levels[L].ac ?? '' }}</td><td>拒收 {{ f.plan.levels[L].re ?? '' }}</td></template></tr>
        </table>
        <table class="result-table">
          <thead><tr><th style="width:44px">序号<small>STT</small></th><th>检验项目<small>Hạng mục kiểm tra</small></th><th>标准<small>Tiêu chuẩn</small></th><th style="width:54px">缺陷等级<small>Mức lỗi</small></th><th style="width:20%">检查结果 / 不良项目<small>Kết quả kiểm tra</small></th>
            <th class="ph-col">照片<small>Hình ảnh</small></th>
            <th v-for="L in LEVEL_KEYS" :key="L" style="width:40px">{{ L }}</th></tr></thead>
          <tbody>
            <template v-for="(r,i) in rows" :key="i">
              <tr v-if="r.head" class="grp"><td colspan="6">{{ r.name }} <small>{{ r.vi }}</small></td><td>/</td><td>/</td><td>/</td></tr>
              <tr v-else>
                <td class="c">{{ r.code }}</td>
                <td>{{ r.name }}<small v-if="r.vi">{{ r.vi }}</small></td>
                <td>{{ r.std }}<small v-if="r.stdVi">{{ r.stdVi }}</small></td>
                <td class="c small">{{ r.res==='NG' ? r.level : r.lvText }}</td>
                <td :class="{red: r.res==='NG'}">{{ r.result }}</td>
                <td class="ph-col"><div class="ph-cell">
                  <div v-for="p in r.photos" :key="p.id" class="rp" :class="{bad: p.defect}">
                    <el-image :src="srcOf(p)" :preview-src-list="allSrc" :initial-index="allSrc.indexOf(srcOf(p))" fit="cover" preview-teleported hide-on-click-modal />
                    <span v-if="p.defect">不良</span>
                  </div>
                  <span v-if="!r.photos.length && r.res!=='NA'" class="red small">缺照片</span>
                </div></td>
                <td v-for="L in LEVEL_KEYS" :key="L" class="c b red">{{ r.level===L && r.qty ? r.qty : '' }}</td>
              </tr>
            </template>
            <tr class="sum"><td colspan="6">缺陷累计 <small>Tổng số lỗi</small></td><td v-for="L in LEVEL_KEYS" :key="L" class="c b">{{ lc.total[L] }}</td></tr>
          </tbody>
        </table>
      </template>

      <!-- 巡检表 -->
      <template v-else>
        <table class="patrol-table print">
          <thead>
            <tr><th colspan="2" class="l">巡检时间 <small>Thời gian tuần kiểm</small></th><th v-for="(s,k) in slots" :key="k">{{ s ? s.time : '' }}</th></tr>
            <tr><th colspan="2" class="l">巡检项目 <small>Mục tuần kiểm</small></th><th v-for="(s,k) in slots" :key="k" class="small">{{ s ? s.qty+'PCS' : '' }}</th></tr>
          </thead>
          <tbody>
            <template v-for="g in patrolGroups" :key="g.name">
              <tr class="g"><td :colspan="2+slots.length">{{ g.name }} <small>{{ g.vi }}</small></td></tr>
              <tr v-for="it in g.items" :key="it.id">
                <td class="c">{{ it.code }}</td>
                <td class="l">{{ it.level }}-{{ it.name }}<span v-if="it.unit" class="muted"> ({{ it.unit }})</span><small>{{ it.vi }}</small></td>
                <td v-for="(s,k) in slots" :key="k" class="c" :class="{ng: s && cellBad(it,k)}">{{ s ? cellText(it,k) : '' }}</td>
              </tr>
            </template>
          </tbody>
        </table>
        <table class="result-table">
          <thead><tr><th style="width:60px">时间</th><th>存在的问题描述<small>Mô tả vấn đề còn tồn tại</small></th><th>原因分析<small>Phân tích nguyên nhân</small></th><th>处理措施<small>Cách xử lý</small></th></tr></thead>
          <tbody>
            <tr v-for="(p,i) in f.problems" :key="i"><td>{{ p.time }}</td><td>{{ p.desc }}</td><td>{{ p.cause }}</td><td>{{ p.action }}</td></tr>
            <tr v-if="!f.problems.length"><td colspan="4" class="c muted">无</td></tr>
          </tbody>
        </table>
        <div class="conclusion">
          <div><span>巡检项次合计 Tổng cộng mục tuần kiểm</span><b>{{ f.patrolTotal }}</b></div>
          <div><span>不良项次合计 Tổng cộng mục không đạt</span><b>{{ f.patrolNg }}</b></div>
          <div><span>巡检不良率 Tỉ lệ không đạt</span><b>{{ f.patrolRate }}%</b></div>
        </div>
      </template>

      <table class="foot-table">
        <tr><td colspan="2">
          检验结果 <small>Kết quả kiểm tra</small>：
          <span v-for="(r,k) in RESULTS" :key="k" class="opt" :class="{on: f.result===k}">{{ box(f.result===k) }} {{ r.zh }} <small>{{ r.vi }}</small></span>
          <span class="who">检验员 <small>Nhân viên kiểm tra</small>：<img v-if="signItem" :src="signItem" class="sign-img" /><b v-else>{{ f.inspector }}</b></span>
          <span class="who">审核人 <small>Nhân viên xét duyệt</small>：<b>{{ f.reviewer || '' }}</b></span>
          <span class="stamp" v-if="f.result" :class="f.result.toLowerCase()">{{ RESULTS[f.result].zh }}</span>
        </td></tr>
        <tr v-if="f.type==='FQC'"><th>不合格处理<small>Xử lý hàng không đạt</small></th>
          <td><span v-for="d in DISPOSITIONS[f.type]" :key="d" class="opt" :class="{on: ncr && ncr.disposition===d}">{{ box(ncr && ncr.disposition===d) }} {{ d }}</span>
            <div v-if="ncr && ncr.action" class="small">{{ ncr.action }}</div></td></tr>
        <tr v-if="f.type==='FQC'"><th>审批人<small>Người phê duyệt</small></th><td><b>{{ f.reviewer || '' }}</b>　<span class="muted small">{{ f.reviewedAt }}</span></td></tr>
        <tr v-if="f.type==='FQC'"><th>负责人<small>Người phụ trách</small></th><td><b>{{ ncr ? (ncr.confirmer || ncr.owner) : '' }}</b></td></tr>
        <tr v-if="f.type!=='FQC'"><th>{{ f.type==='IQC' ? '物料评估' : '评估' }}<small>Đánh giá{{ f.type==='IQC' ? ' vật liệu' : '' }}</small></th>
          <td><span v-for="d in DISPOSITIONS[f.type]" :key="d" class="opt" :class="{on: ncr && ncr.disposition===d}">{{ box(ncr && ncr.disposition===d) }} {{ d }}</span>
            <span class="who">确认人 <small>Người xác nhận</small>：<b>{{ ncr ? ncr.confirmer : '' }}</b>　日期 <small>Ngày</small>：<b>{{ ncr ? ncr.closedAt : '' }}</b></span></td></tr>
        <tr v-if="f.type!=='FQC'"><th>结果跟进<small>Theo dõi kết quả</small></th><td>{{ ncr ? ncr.action : '' }}<span v-if="ncr" class="muted small">（{{ ncr.no }} · {{ ncr.status }}）</span></td></tr>
        <tr><th>备注<small>Ghi chú</small></th><td>{{ f.header.remark }}<div v-if="f.tplNote" class="small">{{ f.tplNote }}<br><span class="muted">{{ f.tplNoteVi }}</span></div></td></tr>
      </table>

      <h3>{{ f.type==='FQC' ? '图片' : '基础信息照片' }}<small>{{ f.type==='FQC' ? 'Hình ảnh' : 'Hình ảnh thông tin cơ bản' }}</small></h3>
      <template v-for="sec in baseSections" :key="sec.name">
        <div v-if="sec.name" class="pg-sec">{{ sec.name }} <small>{{ sec.vi }}</small></div>
        <div class="pg-list base">
          <template v-for="g in sec.items" :key="g.name">
            <figure v-for="(p,i) in g.photos" :key="p.id">
              <img :src="srcOf(p)" />
              <figcaption><b>{{ g.no }}. {{ g.name }}<template v-if="g.photos.length>1"> ({{ i+1 }})</template></b> {{ g.vi }}<br>{{ p.time }} · {{ p.by }}</figcaption>
            </figure>
            <figure v-if="!g.photos.length"><div class="no-photo">未拍</div><figcaption><b>{{ g.no }}. {{ g.name }}</b> {{ g.vi }}</figcaption></figure>
          </template>
        </div>
      </template>
      <template v-if="roundGroups.length">
        <h3>每轮巡检现场照片<small>Hình ảnh mỗi lần tuần kiểm</small></h3>
        <div class="pg-list"><figure v-for="g in roundGroups" :key="g.name"><img :src="srcOf(g.photos[0])" /><figcaption><b>{{ g.name }}</b> · {{ g.photos[0].by }}</figcaption></figure></div>
      </template>
      <h3>缺陷照片<small>Ảnh lỗi</small></h3>
      <div v-if="defectPhotos.length" class="pg-list"><figure v-for="d in defectPhotos" :key="d.p.id" class="bad"><img :src="srcOf(d.p)" /><figcaption><b>{{ d.name }}</b> · {{ d.p.time }} · {{ d.p.by }}</figcaption></figure></div>
      <p v-else class="muted small">无缺陷</p>
      <div class="sheet-foot">{{ f.docNo }} · 本报告由质检数字化管理系统生成 · 扫右上角二维码查看原始记录与照片</div>
    </div>
  </div>
  <el-empty v-else description="报告不存在" />`,
};

/* ---------- 批次追溯（按订单号 / 批号串联 IQC → IPQC → FQC） ---------- */
Pages.Trace = {
  props: ['query'],
  setup() { return { store, go, TYPES, formSubject, formObject }; },
  data() { return { kw: this.query.kw || '' }; },
  computed: {
    hits() { if (!this.kw) return []; return store.forms.filter(f => [f.no, f.header.lot, f.header.order].some(x => x && x.includes(this.kw))); },
    groups() { return ['IQC', 'IPQC', 'FQC'].map(t => ({ t, list: this.hits.filter(f => f.type === t) })); },
    samples() { return [...new Set(store.forms.filter(f => f.type === 'FQC').map(f => f.header.order))].slice(0, 3); },
  },
  template: `
  <div class="page">
    <div class="page-head"><h2>批次追溯 <small class="muted">输入订单号 / 批号 / 单号，调出完整质量档案</small></h2></div>
    <div class="toolbar">
      <el-input v-model="kw" size="large" placeholder="例如 SO-26、PO-、L26…" clearable :prefix-icon="'Search'" style="max-width:420px" />
      <span class="muted small">试试：<el-link v-for="s in samples" :key="s" type="primary" @click="kw=s" style="margin-right:8px">{{ s }}</el-link></span>
    </div>
    <div v-if="kw" class="trace">
      <div v-for="g in groups" :key="g.t" class="trace-col">
        <div class="trace-h"><TypeTag :type="g.t" /> {{ TYPES[g.t].name }} <span class="muted">{{ g.list.length }}</span></div>
        <div v-for="f in g.list" :key="f.no" class="m-card" @click="go('/report/'+f.no)">
          <div class="m-card-top"><span class="mono">{{ f.no }}</span><ResultTag :result="f.result" size="sm" /></div>
          <div class="m-card-sub">{{ formSubject(f) }} · {{ formObject(f) }}</div>
          <div class="m-card-foot"><span class="muted">{{ f.date }} · {{ f.inspector }}</span><span class="muted">照片 {{ f.photoCount }}</span></div>
        </div>
        <div v-if="!g.list.length" class="muted small pad">无记录</div>
      </div>
    </div>
  </div>`,
};

/* ---------- 不合格处理（物料评估 / 结果跟进） ---------- */
Pages.Ncr = {
  setup() { return { store, go, DISPOSITIONS }; },
  data() { return { tab: 'open', edit: null, dlg: false }; },
  computed: {
    rows() { return store.ncrs.filter(n => this.tab === 'all' || (this.tab === 'open' ? n.status !== '已关闭' : n.status === '已关闭')); },
    canDecide() { return ['manager', 'supervisor'].includes(store.role); },
  },
  methods: {
    open(n) { this.edit = { ...n }; this.dlg = true; },
    save(close) {
      const n = store.ncrs.find(x => x.no === this.edit.no);
      if (close && (!this.edit.disposition || !this.edit.action)) { ElementPlus.ElMessage.warning('关闭前请选择评估结果并填写结果跟进'); return; }
      Object.assign(n, this.edit, { status: close ? '已关闭' : (this.edit.disposition ? '处理中' : '待处置'), closedAt: close ? ymd(new Date()) : '', confirmer: close ? ROLES[store.role].user : this.edit.confirmer });
      const f = store.forms.find(x => x.no === n.formNo);
      if (f) f.ncrResult = n.disposition;
      addLog(close ? '关闭不合格单' : '更新不合格单', n.no, n.disposition);
      this.dlg = false; ElementPlus.ElMessage.success(close ? '已关闭，结果已写入报告与台账' : '已保存');
    },
  },
  template: `
  <div class="page">
    <div class="page-head"><h2>不合格处理</h2></div>
    <div class="toolbar"><el-radio-group v-model="tab"><el-radio-button value="open">未关闭</el-radio-button><el-radio-button value="closed">已关闭</el-radio-button><el-radio-button value="all">全部</el-radio-button></el-radio-group></div>
    <el-table :data="rows" stripe @row-click="open" row-class-name="clickable">
      <el-table-column label="处理单号" width="170"><template #default="{row}"><span class="mono">{{ row.no }}</span></template></el-table-column>
      <el-table-column label="关联检验单" width="200"><template #default="{row}"><TypeTag :type="row.type" /> <el-link type="primary" @click.stop="go('/report/'+row.formNo)">{{ row.formNo }}</el-link></template></el-table-column>
      <el-table-column prop="desc" label="不良项" min-width="180" show-overflow-tooltip />
      <el-table-column prop="owner" label="责任方" min-width="150" show-overflow-tooltip />
      <el-table-column prop="disposition" label="评估结果" width="120" />
      <el-table-column prop="action" label="结果跟进" min-width="200" show-overflow-tooltip />
      <el-table-column label="状态" width="90"><template #default="{row}"><el-tag size="small" :type="row.status==='已关闭'?'success':row.status==='待处置'?'danger':'warning'">{{ row.status }}</el-tag></template></el-table-column>
      <el-table-column prop="confirmer" label="确认人" width="80" />
      <el-table-column prop="closedAt" label="日期" width="100" />
    </el-table>

    <el-dialog v-model="dlg" :title="edit && edit.no" width="min(600px, 94vw)">
      <el-form v-if="edit" label-width="100px" :disabled="!canDecide || edit.status==='已关闭'">
        <el-form-item label="关联单据"><el-link type="primary" @click="dlg=false;go('/report/'+edit.formNo)">{{ edit.formNo }}</el-link></el-form-item>
        <el-form-item label="不良项"><el-input v-model="edit.desc" /></el-form-item>
        <el-form-item label="责任方"><el-input v-model="edit.owner" /></el-form-item>
        <el-form-item :label="edit.type==='IQC'?'物料评估':'评估'"><el-radio-group v-model="edit.disposition"><el-radio-button v-for="d in DISPOSITIONS[edit.type]" :key="d" :value="d">{{ d }}</el-radio-button></el-radio-group></el-form-item>
        <el-form-item label="结果跟进"><el-input v-model="edit.action" type="textarea" :rows="3" placeholder="处理过程、纠正与预防措施、跟进结果" /></el-form-item>
        <el-form-item label="8D 报告"><el-button size="small" disabled>发起 8D</el-button><span class="muted small" style="margin-left:8px">二期</span></el-form-item>
      </el-form>
      <div v-if="!canDecide" class="muted small">当前角色只能查看，评估由质量经理 / QC 主管确认。</div>
      <template #footer v-if="canDecide && edit && edit.status!=='已关闭'">
        <el-button @click="save(false)">保存</el-button><el-button type="primary" @click="save(true)">确认并关闭</el-button>
      </template>
    </el-dialog>
  </div>`,
};
