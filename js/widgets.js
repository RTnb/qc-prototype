/* ============================================================
 * 通用小部件：标签、流程条、单元格拍照、手写签名、检验项、巡检表
 * ============================================================ */
const Widgets = {};

Widgets.TypeTag = {
  props: ['type'],
  computed: { t() { return TYPES[this.type] || {}; } },
  template: `<span class="type-tag" :style="{color:t.color,background:t.bg}">{{ type }}</span>`,
};
Widgets.StatusTag = {
  props: ['status'],
  setup() { return { STATUS }; },
  template: `<el-tag :type="(STATUS[status]||{}).tag" size="small" effect="light" round>{{ (STATUS[status]||{}).label }}</el-tag>`,
};
Widgets.ResultTag = {
  props: ['result', 'size'],
  setup() { return { RESULTS }; },
  template: `<span v-if="result" class="result-tag" :class="[result.toLowerCase(), size]">{{ RESULTS[result].zh }}</span><span v-else class="muted">—</span>`,
};
Widgets.LevelBadge = {
  props: ['level'],
  setup() { return { LEVELS }; },
  computed: { k() { const k = String(this.level || '').split('/')[0]; return LEVELS[k] ? k : null; } },
  template: `<span v-if="k" class="lv-badge" :style="{color:LEVELS[k].color,background:LEVELS[k].bg}">{{ level }}</span>`,
};
/* 中文 + 越南文（越南文可在顶栏关闭） */
Widgets.Bi = {
  props: ['zh', 'vi', 'inline'],
  setup() { return { store }; },
  template: `<span class="bi" :class="{inline}">{{ zh }}<small v-if="vi && store.showVi" class="vi">{{ vi }}</small></span>`,
};

/* 检验主流程 5 步 */
Widgets.FlowSteps = {
  props: ['status', 'result'],
  computed: {
    active() { return { draft: 1, returned: 1, submitted: 3, approved: 4 }[this.status] ?? 0; },
    last() { return this.result === 'NG' || this.result === 'HOLD' ? '不合格处理' : '放行'; },
  },
  template: `
  <el-steps :active="active" finish-status="success" align-center class="flow-steps">
    <el-step title="建单" />
    <el-step title="填写拍照" :status="status==='returned'?'error':''" :description="status==='returned'?'被退回':''" />
    <el-step title="提交判定" />
    <el-step title="审核" />
    <el-step :title="last" :status="status==='approved'&&result==='NG'?'error':''" />
  </el-steps>`,
};

/* ---------- 照片：前端压缩 + 自动水印 ---------- */
async function processPhoto(file, mark, maxSide = 1280) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    const fs = Math.max(14, Math.round(w / 40)), band = fs * 2.9;
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, h - band, w, band);
    g.fillStyle = '#fff'; g.font = `${fs}px sans-serif`; g.textBaseline = 'top';
    g.fillText(`${mark.time}  ${mark.no}`, fs * 0.7, h - band + fs * 0.35);
    g.fillText(`${mark.item} · ${mark.by}`, fs * 0.7, h - band + fs * 1.55);
    const src = c.toDataURL('image/jpeg', 0.72);
    return { src, kb: Math.round(src.length * 0.75 / 1024) };
  } finally { URL.revokeObjectURL(url); }
}

Widgets.PhotoCell = {
  props: { photos: Array, itemName: String, formNo: String, inspector: String, readonly: Boolean, min: Number, preview: Boolean, compact: Boolean, pool: Array, defectMode: Boolean, hint: String },
  data() { return { busy: false, picking: false, chosen: [] }; },
  computed: {
    srcList() { return this.photos.map(srcOf); },
    needDefect() { return this.defectMode && !this.photos.some(isDefectPhoto); },
    poolLeft() { // 本单其它已拍照片（排除本格已有的）
      const mine = new Set(this.photos.map(p => p.src || (p.ph + '|' + p.hue)));
      return (this.pool || []).filter(p => !mine.has(p.src || (p.ph + '|' + p.hue)));
    },
  },
  methods: {
    srcOf,
    pick() { if (this.preview) { ElementPlus.ElMessage.info('预览模式：实际使用时会调起手机后置相机'); return; } this.$refs.file.click(); },
    openPool() { this.chosen = []; this.picking = true; },
    toggle(p) { const i = this.chosen.indexOf(p); i < 0 ? this.chosen.push(p) : this.chosen.splice(i, 1); },
    usePool() {
      this.chosen.forEach(p => { const { from, ...rest } = p; this.photos.push({ ...rest, id: uid(), ref: true }); });
      if (this.chosen.length) ElementPlus.ElMessage.success(`已引用 ${this.chosen.length} 张本单照片`);
      this.picking = false;
    },
    async onFiles(e) {
      const files = [...e.target.files]; e.target.value = '';
      if (!files.length) return;
      this.busy = true;
      try {
        for (const file of files) {
          const time = nowStr();
          const item = (this.defectMode ? '不良 · ' : '') + this.itemName;
          const r = await processPhoto(file, { time, no: this.formNo || '未编号', item, by: this.inspector });
          this.photos.push({ id: uid(), src: r.src, time, by: this.inspector, sample: this.photos.length + 1, kb: r.kb, defect: this.defectMode || undefined });
        }
        ElementPlus.ElMessage.success(`已上传 ${files.length} 张（已压缩并加水印）`);
      } catch (err) { ElementPlus.ElMessage.error('图片处理失败'); }
      this.busy = false;
    },
    remove(i) { this.photos.splice(i, 1); },
  },
  template: `
  <div class="photo-cell" :class="{compact}">
    <div v-for="(p,i) in photos" :key="p.id" class="thumb">
      <el-image :src="srcOf(p)" :preview-src-list="srcList" :initial-index="i" fit="cover" preview-teleported hide-on-click-modal />
      <span class="thumb-no">{{ i+1 }}</span>
      <span v-if="p.ref" class="thumb-ref">引用</span>
      <span v-else-if="p.defect" class="thumb-ref bad">不良</span>
      <button v-if="!readonly" class="thumb-del" @click.stop="remove(i)" title="删除">×</button>
    </div>
    <button v-if="!readonly" class="thumb add" :class="{need: (min && photos.length < min) || needDefect, bad: defectMode}" @click="pick" v-loading="busy">
      <el-icon :size="compact?18:22"><Camera /></el-icon>
      <span>{{ defectMode ? '拍不良部位' : (hint && !photos.length ? hint : (min && photos.length < min ? '需 '+min+' 张' : '拍照')) }}</span>
    </button>
    <button v-if="!readonly && poolLeft.length" class="thumb add pool" @click="openPool">
      <el-icon :size="compact?16:20"><PictureFilled /></el-icon>
      <span>选本单已拍</span>
    </button>
    <el-dialog v-model="picking" title="选本单已拍的照片" width="min(560px, 94vw)" append-to-body>
      <p class="muted small" style="margin:0 0 10px">一张照片能证明多个项目时直接引用，不用重复拍。</p>
      <div class="pool-grid">
        <figure v-for="p in poolLeft" :key="p.id" :class="{on: chosen.includes(p)}" @click="toggle(p)">
          <img :src="srcOf(p)" alt="" /><figcaption>{{ p.from }}</figcaption><span class="tick">✓</span>
        </figure>
      </div>
      <template #footer><el-button @click="picking=false">取消</el-button><el-button type="primary" :disabled="!chosen.length" @click="usePool">引用 {{ chosen.length || '' }} 张</el-button></template>
    </el-dialog>
    <input ref="file" type="file" accept="image/*" :capture="store.settings.allowAlbum ? undefined : 'environment'" multiple hidden @change="onFiles" />
    <span v-if="readonly && !photos.length" class="muted small">无照片</span>
    <span v-if="needDefect && !readonly" class="defect-hint">判不合格：必须当场拍一张不良部位的照片</span>
  </div>`,
  setup() { return { store }; },
};

/* ---------- 手写签名 ---------- */
Widgets.SignPad = {
  props: { modelValue: String, readonly: Boolean },
  emits: ['update:modelValue'],
  data() { return { open: false, drawing: false }; },
  methods: {
    start() { if (!this.readonly) { this.open = true; this.$nextTick(() => this.init()); } },
    init() {
      const c = this.$refs.cv; const r = c.getBoundingClientRect();
      c.width = r.width * 2; c.height = r.height * 2;
      const g = c.getContext('2d'); g.scale(2, 2); g.lineWidth = 2.4; g.lineCap = 'round'; g.strokeStyle = '#1b2333';
      this.g = g;
    },
    pos(e) { const r = this.$refs.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; },
    down(e) { this.drawing = true; this.g.beginPath(); this.g.moveTo(...this.pos(e)); this.$refs.cv.setPointerCapture(e.pointerId); },
    move(e) { if (!this.drawing) return; this.g.lineTo(...this.pos(e)); this.g.stroke(); },
    up() { this.drawing = false; },
    save() { this.$emit('update:modelValue', this.$refs.cv.toDataURL('image/png')); this.open = false; },
  },
  template: `
  <div class="sign-pad">
    <div class="sign-box" :class="{empty:!modelValue, ro:readonly}" @click="start">
      <img v-if="modelValue" :src="modelValue" alt="签名" />
      <span v-else>{{ readonly ? '未签名' : '点击签名' }}</span>
    </div>
    <el-dialog v-model="open" title="手写签名" width="min(520px, 94vw)" append-to-body>
      <canvas ref="cv" class="sign-canvas" @pointerdown="down" @pointermove="move" @pointerup="up" @pointerleave="up"></canvas>
      <template #footer><el-button @click="init">清除</el-button><el-button type="primary" @click="save">确认签名</el-button></template>
    </el-dialog>
  </div>`,
};

/* ---------- 检验项（进料 / 成品报告的一行） ---------- */
Widgets.ItemField = {
  props: { item: Object, val: Object, readonly: Boolean, formNo: String, inspector: String, preview: Boolean, index: Number, ngPhoto: { type: Boolean, default: true }, photoAll: Boolean, pool: Array },
  components: { PhotoCell: Widgets.PhotoCell, SignPad: Widgets.SignPad },
  setup() { return { MASTER, FIELD_TYPES, store, isPatrol }; },
  data() { return { showNote: false }; },
  computed: {
    res() { return itemResult(this.item, this.val); },
    stats() { return this.item.type === 'table' ? tableStats(this.item, this.val.rows || []) : []; },
    needPhoto() { return photoNeed(this.item, this.val, { all: this.photoAll, ng: this.ngPhoto }); },
    ngQty() { return defectQtyOf(this.item, this.val); },
  },
  methods: {
    setJudge(j) {
      if (this.readonly) return;
      this.val.judge = this.val.judge === j ? '' : j;
      if (this.val.judge === 'NG' && !this.val.qty) this.val.qty = 1;
      if (this.val.judge === 'NG' && !this.val.level) this.val.level = this.item.level;
      if (this.val.judge === 'NA') { this.val.qty = null; this.val.defect = ''; }   // 判合格也允许记不良数（纸质表按缺陷数累计）
    },
    cellNG(j, x) { return dimNG(this.item.dims[j], x); },
    filled,
    setStd(d, raw) {
      const v = Number(raw); if (!raw || isNaN(v)) return;
      d.std = v; if (filled(d.pct)) { d.lo = +(v * (1 - d.pct / 100)).toFixed(3); d.hi = +(v * (1 + d.pct / 100)).toFixed(3); }
    },
    /* 纸质表“公差自填”：检验员当场填 ±%，系统据此算上下限并自动标红超差 */
    setTol(d, raw) {
      const v = Number(raw); if (!raw || isNaN(v) || v <= 0) return;
      d.pct = v;
      if (filled(d.std)) { d.lo = +(d.std * (1 - v / 100)).toFixed(3); d.hi = +(d.std * (1 + v / 100)).toFixed(3); }
    },
  },
  template: `
  <div class="item-card" :class="{ng: res==='NG'}">
    <div class="item-head">
      <span class="item-idx">{{ item.code || index }}</span>
      <LevelBadge :level="item.other ? '' : (item.levels ? item.levels.join('/') : item.level)" />
      <span class="item-name"><Bi :zh="item.name" :vi="item.vi" /><i v-if="item.required && ['judge','measure','table','select'].includes(item.type)" class="req">*</i></span>
      <span class="spacer"></span>
      <span v-if="item.checkQty" class="item-type">查 {{ item.checkQty }} 只</span>
      <span v-if="item.sampling==='fixed'" class="item-type">5PCS</span>
      <span v-if="res" class="item-res" :class="res.toLowerCase()">{{ res }}<template v-if="res==='NG'"> ×{{ ngQty }}</template></span>
    </div>
    <div v-if="item.remark && !item.other" class="item-remark"><span class="std-lbl">标准</span><Bi :zh="item.remark" :vi="item.remarkVi" /></div>
    <div v-if="item.other" class="item-body">
      <el-input v-model="val.otherName" :disabled="readonly" placeholder="自填检验项目和标准（不用可留空）" />
    </div>

    <div v-if="item.type==='measure'" class="item-body measure">
      <div class="limit">标准 {{ item.std }}（{{ item.lo }} ~ {{ item.hi }}）{{ item.unit }}</div>
      <el-input-number v-model="val.value" :disabled="readonly" :controls="false" :precision="3" placeholder="输入实测值" class="measure-input" :class="{ng: res==='NG'}" />
      <span class="unit">{{ item.unit }}</span>
    </div>

    <div v-else-if="item.type==='judge'" class="item-body">
      <div class="judge-group" :class="{ro:readonly}">
        <button v-for="j in ['OK','NG','NA']" :key="j" :class="['jbtn', j.toLowerCase(), {on: val.judge===j}]" @click="setJudge(j)">{{ j }}</button>
      </div>
      <a v-if="!readonly && val.judge!=='NG' && !val.note && !showNote" class="note-link" @click="showNote=true">+ 检查结果</a>
    </div>

    <div v-else-if="item.type==='select'" class="item-body">
      <el-select v-model="val.value" :multiple="!!item.multiple" :disabled="readonly" placeholder="请选择" collapse-tags style="max-width:420px">
        <el-option v-for="o in (item.options||[])" :key="o" :label="o" :value="o" />
      </el-select>
    </div>

    <div v-else-if="item.type==='table'" class="item-body table-wrap">
      <table class="sample-table">
        <thead><tr><th>样本</th><th v-for="d in item.dims" :key="d.name">{{ d.name }}
          <template v-if="filled(d.std)">
            <small>{{ d.std }}<template v-if="filled(d.pct)"> ±{{ d.pct }}%</template></small>
            <small v-if="filled(d.lo)">{{ d.lo }} ~ {{ d.hi }}</small>
            <small v-else-if="!readonly" class="tol-ask">公差待填 <input class="std-input" type="number" step="any" placeholder="±%" @change="setTol(d, $event.target.value)" /></small>
            <small v-else>公差未填</small>
          </template>
          <template v-else-if="!readonly"><small class="red">标准值未带出，请按规格书填</small><input class="std-input" type="number" step="any" placeholder="标准值" @change="setStd(d, $event.target.value)" /></template>
          <small v-else>无标准值</small>
        </th></tr></thead>
        <tbody>
          <tr v-for="(row,i) in val.rows" :key="i">
            <td class="sn">{{ i+1 }}</td>
            <td v-for="(x,j) in row" :key="j" :class="{ng: cellNG(j,x)}">
              <input v-if="!readonly" type="number" inputmode="decimal" step="any" :value="x" @input="row[j] = $event.target.value===''?null:Number($event.target.value)" />
              <span v-else>{{ x ?? '—' }}</span>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr><td>最大</td><td v-for="(s,j) in stats" :key="'a'+j" :class="{ng:s.ng}">{{ s.max }}</td></tr>
          <tr><td>最小</td><td v-for="(s,j) in stats" :key="'b'+j">{{ s.min }}</td></tr>
          <tr><td>均值</td><td v-for="(s,j) in stats" :key="'c'+j">{{ s.avg }}</td></tr>
        </tfoot>
      </table>
    </div>

    <div v-else-if="item.type==='number'" class="item-body measure">
      <el-input-number v-model="val.value" :disabled="readonly" :min="0" controls-position="right" /><span class="unit">{{ item.unit }}</span>
    </div>
    <div v-else-if="item.type==='text'" class="item-body">
      <el-input v-model="val.value" :disabled="readonly" type="textarea" :rows="2" placeholder="填写备注" />
    </div>
    <div v-else-if="item.type==='sign'" class="item-body"><SignPad v-model="val.sign" :readonly="readonly" /></div>
    <div v-else-if="isPatrol(item)" class="item-body muted small">巡检项：在巡检表里按轮次填写（{{ item.type==='check' ? '✓ / ✗' : '读数 ' + (item.unit||'') }}）</div>

    <!-- NG：不良数 + 检查结果 + 可选缺陷代码 -->
    <div v-if="res==='NG' && item.levels && item.type!=='judge'" class="item-ng">
      <label><span>缺陷等级</span><el-radio-group v-model="val.level" :disabled="readonly" size="small"><el-radio-button v-for="L in item.levels" :key="L" :value="L">{{ L }}</el-radio-button></el-radio-group></label>
    </div>
    <div v-if="res==='NG' && item.type==='judge'" class="item-ng">
      <label v-if="item.levels"><span>缺陷等级</span><el-radio-group v-model="val.level" :disabled="readonly" size="default"><el-radio-button v-for="L in item.levels" :key="L" :value="L">{{ L }}</el-radio-button></el-radio-group></label>
      <label><span>不良数</span><el-input-number v-model="val.qty" :min="1" :disabled="readonly" size="default" controls-position="right" /></label>
      <label class="grow"><span>检查结果</span><el-input v-model="val.note" :disabled="readonly" placeholder="不良描述（必填）" /></label>
      <label><span>缺陷代码</span><el-select v-model="val.defect" :disabled="readonly" placeholder="选填" clearable filterable>
        <el-option v-for="d in MASTER.defects" :key="d.code" :label="d.code+' '+d.name" :value="d.code" /></el-select></label>
    </div>
    <div v-else-if="item.type==='judge' && (val.note || showNote || val.judge === 'OK')" class="item-ng">
      <label><span>不良数</span><el-input-number v-model="val.qty" :min="0" :disabled="readonly" size="default" controls-position="right" placeholder="选填" /></label>
      <label class="grow"><span>检查结果</span><el-input v-model="val.note" :disabled="readonly" placeholder="选填" /></label>
    </div>

    <div v-if="needPhoto || item.type==='photo' || (val.photos && val.photos.length)" class="item-photos">
      <PhotoCell :photos="val.photos" :item-name="(item.code?item.code+' ':'')+item.name" :form-no="formNo" :inspector="inspector" :readonly="readonly" :min="needPhoto" :preview="preview" :pool="pool" :defect-mode="res==='NG'" :hint="['table','measure'].includes(item.type) ? '拍测量读数' : ''" />
    </div>
  </div>`,
};

/* ---------- 巡检表（SL/QR-36-02）：按轮次填写 + 总表 ---------- */
Widgets.PatrolSheet = {
  props: { f: Object, editable: Boolean },
  components: { PhotoCell: Widgets.PhotoCell },
  setup() { return { store }; },
  data() { return { cur: Math.max(0, this.f.rounds.length - 1), mode: 'round', openPhoto: {} }; },
  computed: {
    maxRounds() { return (this.f.tplPatrol && this.f.tplPatrol.rounds) || 6; },
    groups() {
      const out = [];
      this.f.items.filter(isPatrol).forEach(it => {
        let g = out[out.length - 1];
        if (!g || g.name !== it.group) { g = { name: it.group, vi: it.groupVi, items: [] }; out.push(g); }
        g.items.push(it);
      });
      return out;
    },
    round() { const r = this.f.rounds[this.cur]; if (r && !r.photos) r.photos = []; return r; },
    pool() { return allPhotos(this.f); },
    roundStat() {
      return this.f.rounds.map((r, k) => {
        let fill = 0, ng = 0, all = 0;
        this.f.items.filter(isPatrol).forEach(it => { all++; const c = this.f.values[it.id].cells[k]; if (cellFilled(it, c)) fill++; if (cellNG(it, c)) ng++; });
        return { fill, ng, all };
      });
    },
  },
  methods: {
    addRound() {
      if (this.f.rounds.length >= this.maxRounds) { ElementPlus.ElMessage.warning(`本页最多 ${this.maxRounds} 轮，请新建下一页`); return; }
      this.f.rounds.push({ time: hm(), by: this.f.inspector, qty: (this.f.tplPatrol && this.f.tplPatrol.perRound) || 10, photos: [] });
      this.f.items.forEach(it => { if (isPatrol(it)) this.f.values[it.id].cells.push({ v: it.type === 'check' ? '' : null, ng: false }); });
      this.cur = this.f.rounds.length - 1; this.mode = 'round';
    },
    removeRound() {
      const k = this.f.rounds.length - 1; if (k < 0) return;
      ElementPlus.ElMessageBox.confirm(`删除第 ${k + 1} 轮（${this.f.rounds[k].time}）的记录？`, '删除巡检轮次', { type: 'warning' }).then(() => {
        this.f.rounds.pop(); this.f.items.forEach(it => { if (isPatrol(it)) this.f.values[it.id].cells.pop(); });
        this.cur = Math.max(0, this.f.rounds.length - 1);
      }).catch(() => { });
    },
    cell(it, k = this.cur) { return this.f.values[it.id].cells[k]; },
    toggleNg(it) { if (!this.editable) return; const c = this.cell(it); c.ng = !c.ng; },
    allOk() { this.f.items.forEach(it => { if (it.type === 'check') { const c = this.cell(it); if (!c.v) c.v = 'OK'; } }); },
    isNG(it, k) { return cellNG(it, this.cell(it, k)); },
    itemNG(it) { return itemResult(it, this.f.values[it.id]) === 'NG'; },
    filled,
    onReading() { /* 超限由检验单页统一上报，见 Pages.Form 的 anomalyKeys 监听 */ },
    setCheck(it, v) { if (!this.editable) return; const c = this.cell(it); c.v = c.v === v ? '' : v; },
    isDefectPhoto,
    show(it, k) { const c = this.cell(it, k); if (!cellFilled(it, c)) return ''; return it.type === 'check' ? (c.v === 'OK' ? '✓' : '✗') : c.v; },
  },
  template: `
  <div class="patrol">
    <div class="patrol-bar">
      <div class="round-chips">
        <button v-for="(r,k) in f.rounds" :key="k" class="rchip" :class="{on: mode==='round' && cur===k, ng: roundStat[k].ng, done: roundStat[k].fill===roundStat[k].all}" @click="cur=k; mode='round'">
          <b>第{{ k+1 }}轮</b><small>{{ r.time }}</small>
        </button>
        <button v-if="editable && f.rounds.length < maxRounds" class="rchip add" @click="addRound"><el-icon><Plus /></el-icon><small>新增一轮</small></button>
      </div>
      <el-radio-group v-model="mode" size="small"><el-radio-button value="round">逐轮填写</el-radio-button><el-radio-button value="sheet">总表</el-radio-button></el-radio-group>
    </div>

    <el-empty v-if="!f.rounds.length" :description="editable ? '点「新增一轮」开始第一次巡检（每 2 小时一次，每次抽查 10 PCS）' : '没有巡检记录'" :image-size="70" />

    <template v-else-if="mode==='round' && round">
      <div class="round-head">
        <label>巡检时间 <el-input v-model="round.time" :disabled="!editable" size="small" style="width:86px" /></label>
        <label>抽查数 <el-input-number v-model="round.qty" :disabled="!editable" :min="1" size="small" controls-position="right" style="width:90px" /> PCS</label>
        <label class="muted small">巡检人 {{ round.by }}</label>
        <span class="spacer"></span>
        <el-button v-if="editable" size="small" @click="allOk">未填的判定项全部 ✓</el-button>
        <el-button v-if="editable && cur===f.rounds.length-1" size="small" text type="danger" @click="removeRound">删除本轮</el-button>
      </div>
      <div class="round-photos">
        <span class="lbl">本轮现场照片<small v-if="f.roundPhoto">（至少 {{ f.roundPhoto }} 张）</small><small v-if="store.showVi" class="vi">Hình ảnh hiện trường</small></span>
        <PhotoCell :photos="round.photos" :item-name="'第'+(cur+1)+'轮巡检 '+round.time" :form-no="f.no" :inspector="f.inspector" :readonly="!editable" :min="f.roundPhoto" compact />
      </div>
      <div v-for="g in groups" :key="g.name" class="p-group">
        <div class="p-group-h"><Bi :zh="g.name" :vi="g.vi" inline /></div>
        <div v-for="it in g.items" :key="it.id" class="p-row" :class="{ng: isNG(it)}">
          <span class="p-code">{{ it.code }}</span>
          <LevelBadge :level="it.level" />
          <span class="p-name"><Bi :zh="it.name" :vi="it.vi" /><small v-if="it.type==='reading' && filled(it.lo)" class="p-limit">标准 {{ it.std }}（{{ it.lo }} ~ {{ it.hi }}）{{ it.unit }}</small></span>
          <span class="p-ctrl">
            <template v-if="it.type==='check'">
              <button class="pbtn ok" :class="{on: cell(it).v==='OK'}" @click="setCheck(it,'OK')">✓</button>
              <button class="pbtn ng" :class="{on: cell(it).v==='NG'}" @click="setCheck(it,'NG')">✗</button>
            </template>
            <template v-else>
              <el-input-number v-model="cell(it).v" :disabled="!editable" :controls="false" size="default" class="p-num" :class="{ng: isNG(it)}" :placeholder="it.unit" @change="onReading(it)" />
              <span class="unit">{{ it.unit }}</span>
              <button class="pbtn ng sm" :class="{on: cell(it).ng}" @click="toggleNg(it)" title="标记异常">✗</button>
            </template>
            <button class="pbtn cam" :class="{has: f.values[it.id].photos.length}" @click="openPhoto[it.id]=!openPhoto[it.id]" title="拍照">
              <el-icon><Camera /></el-icon><small v-if="f.values[it.id].photos.length">{{ f.values[it.id].photos.length }}</small>
            </button>
          </span>
          <div v-if="openPhoto[it.id] || (itemNG(it) && !f.values[it.id].photos.some(isDefectPhoto))" class="p-photos">
            <PhotoCell :photos="f.values[it.id].photos" :item-name="it.code+' '+it.name" :form-no="f.no" :inspector="f.inspector" :readonly="!editable" :min="itemNG(it)?1:0" :pool="pool" :defect-mode="itemNG(it)" compact />
          </div>
        </div>
      </div>
    </template>

    <div v-else-if="mode==='sheet'" class="sheet-wrap">
      <table class="patrol-table">
        <thead>
          <tr><th class="l" colspan="3">巡检项目 <small>Mục tuần kiểm</small></th><th v-for="(r,k) in f.rounds" :key="k">{{ r.time }}</th></tr>
        </thead>
        <tbody>
          <template v-for="g in groups" :key="g.name">
            <tr class="g"><td :colspan="3+f.rounds.length">{{ g.name }}</td></tr>
            <tr v-for="it in g.items" :key="it.id">
              <td class="c">{{ it.code }}</td><td class="c"><LevelBadge :level="it.level" /></td>
              <td class="l">{{ it.name }}<span v-if="it.unit" class="muted"> ({{ it.unit }})</span></td>
              <td v-for="(r,k) in f.rounds" :key="k" :class="{ng: isNG(it,k)}" @click="cur=k; mode='round'">{{ show(it,k) }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>`,
};
