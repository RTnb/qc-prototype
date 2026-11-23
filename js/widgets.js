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
  template: `<span v-if="level" class="lv-badge" :style="{color:LEVELS[level].color,background:LEVELS[level].bg}">{{ level }}</span>`,
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
  props: { photos: Array, itemName: String, formNo: String, inspector: String, readonly: Boolean, min: Number, preview: Boolean, compact: Boolean },
  data() { return { busy: false }; },
  computed: { srcList() { return this.photos.map(p => p.src); } },
  methods: {
    pick() { if (this.preview) { ElementPlus.ElMessage.info('预览模式：实际使用时会调起手机后置相机'); return; } this.$refs.file.click(); },
    async onFiles(e) {
      const files = [...e.target.files]; e.target.value = '';
      if (!files.length) return;
      this.busy = true;
      try {
        for (const file of files) {
          const time = nowStr();
          const r = await processPhoto(file, { time, no: this.formNo || '未编号', item: this.itemName, by: this.inspector });
          this.photos.push({ id: uid(), src: r.src, time, by: this.inspector, sample: this.photos.length + 1, kb: r.kb });
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
      <el-image :src="p.src" :preview-src-list="srcList" :initial-index="i" fit="cover" preview-teleported hide-on-click-modal />
      <span class="thumb-no">{{ i+1 }}</span>
      <button v-if="!readonly" class="thumb-del" @click.stop="remove(i)" title="删除">×</button>
    </div>
    <button v-if="!readonly" class="thumb add" :class="{need: min && photos.length < min}" @click="pick" v-loading="busy">
      <el-icon :size="compact?18:22"><Camera /></el-icon>
      <span>{{ min && photos.length < min ? '需 '+min+' 张' : '拍照' }}</span>
    </button>
    <input ref="file" type="file" accept="image/*" :capture="store.settings.allowAlbum ? undefined : 'environment'" multiple hidden @change="onFiles" />
    <span v-if="readonly && !photos.length" class="muted small">无照片</span>
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
  props: { item: Object, val: Object, readonly: Boolean, formNo: String, inspector: String, preview: Boolean, index: Number, ngPhoto: { type: Boolean, default: true } },
  components: { PhotoCell: Widgets.PhotoCell, SignPad: Widgets.SignPad },
  setup() { return { MASTER, FIELD_TYPES, store, isPatrol }; },
  data() { return { showNote: false }; },
  computed: {
    res() { return itemResult(this.item, this.val); },
    stats() { return this.item.type === 'table' ? tableStats(this.item, this.val.rows || []) : []; },
    needPhoto() {
      const it = this.item;
      let n = it.type === 'photo' ? (it.minPhotos || 1) : (it.mustPhoto ? (it.minPhotos || 1) : 0);
      if (this.res === 'NG' && this.ngPhoto) n = Math.max(n, 1);
      return n;
    },
    ngQty() { return this.res === 'NG' ? itemQty(this.item, this.val) : 0; },
  },
  methods: {
    setJudge(j) {
      if (this.readonly) return;
      this.val.judge = this.val.judge === j ? '' : j;
      if (this.val.judge === 'NG' && !this.val.qty) this.val.qty = 1;
      if (this.val.judge !== 'NG') { this.val.qty = null; this.val.defect = ''; }
    },
    cellNG(j, x) { return dimNG(this.item.dims[j], x); },
  },
  template: `
  <div class="item-card" :class="{ng: res==='NG'}">
    <div class="item-head">
      <span class="item-idx">{{ item.code || index }}</span>
      <LevelBadge :level="item.level" />
      <span class="item-name"><Bi :zh="item.name" :vi="item.vi" /><i v-if="item.required && ['judge','measure','table'].includes(item.type)" class="req">*</i></span>
      <span class="spacer"></span>
      <span v-if="item.sampling==='fixed'" class="item-type">5PCS</span>
      <span v-if="res" class="item-res" :class="res.toLowerCase()">{{ res }}<template v-if="res==='NG'"> ×{{ ngQty }}</template></span>
    </div>
    <div v-if="item.remark" class="item-remark"><Bi :zh="item.remark" :vi="item.remarkVi" /></div>

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

    <div v-else-if="item.type==='table'" class="item-body table-wrap">
      <table class="sample-table">
        <thead><tr><th>样本</th><th v-for="d in item.dims" :key="d.name">{{ d.name }}<small>{{ d.std }}<template v-if="d.pct"> ±{{ d.pct }}%</template></small><small>{{ d.lo }} ~ {{ d.hi }}</small></th></tr></thead>
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
    <div v-if="res==='NG' && item.type==='judge'" class="item-ng">
      <label><span>不良数</span><el-input-number v-model="val.qty" :min="1" :disabled="readonly" size="default" controls-position="right" /></label>
      <label class="grow"><span>检查结果</span><el-input v-model="val.note" :disabled="readonly" placeholder="不良描述（必填）" /></label>
      <label><span>缺陷代码</span><el-select v-model="val.defect" :disabled="readonly" placeholder="选填" clearable filterable>
        <el-option v-for="d in MASTER.defects" :key="d.code" :label="d.code+' '+d.name" :value="d.code" /></el-select></label>
    </div>
    <div v-else-if="item.type==='judge' && (val.note || showNote)" class="item-ng">
      <label class="grow"><span>检查结果</span><el-input v-model="val.note" :disabled="readonly" placeholder="选填" /></label>
    </div>

    <div v-if="needPhoto || item.type==='photo' || (val.photos && val.photos.length)" class="item-photos">
      <PhotoCell :photos="val.photos" :item-name="(item.code?item.code+' ':'')+item.name" :form-no="formNo" :inspector="inspector" :readonly="readonly" :min="needPhoto" :preview="preview" />
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
    round() { return this.f.rounds[this.cur]; },
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
      this.f.rounds.push({ time: hm(), by: this.f.inspector, qty: (this.f.tplPatrol && this.f.tplPatrol.perRound) || 10 });
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
    setCheck(it, v) { if (!this.editable) return; const c = this.cell(it); c.v = c.v === v ? '' : v; },
    toggleNg(it) { if (!this.editable) return; const c = this.cell(it); c.ng = !c.ng; },
    allOk() { this.f.items.forEach(it => { if (it.type === 'check') { const c = this.cell(it); if (!c.v) c.v = 'OK'; } }); },
    isNG(it, k) { return cellNG(it, this.cell(it, k)); },
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
      <div v-for="g in groups" :key="g.name" class="p-group">
        <div class="p-group-h"><Bi :zh="g.name" :vi="g.vi" inline /></div>
        <div v-for="it in g.items" :key="it.id" class="p-row" :class="{ng: isNG(it)}">
          <span class="p-code">{{ it.code }}</span>
          <LevelBadge :level="it.level" />
          <span class="p-name"><Bi :zh="it.name" :vi="it.vi" /></span>
          <span class="p-ctrl">
            <template v-if="it.type==='check'">
              <button class="pbtn ok" :class="{on: cell(it).v==='OK'}" @click="setCheck(it,'OK')">✓</button>
              <button class="pbtn ng" :class="{on: cell(it).v==='NG'}" @click="setCheck(it,'NG')">✗</button>
            </template>
            <template v-else>
              <el-input-number v-model="cell(it).v" :disabled="!editable" :controls="false" size="default" class="p-num" :placeholder="it.unit" />
              <span class="unit">{{ it.unit }}</span>
              <button class="pbtn ng sm" :class="{on: cell(it).ng}" @click="toggleNg(it)" title="标记异常">✗</button>
            </template>
            <button class="pbtn cam" :class="{has: f.values[it.id].photos.length}" @click="openPhoto[it.id]=!openPhoto[it.id]" title="拍照">
              <el-icon><Camera /></el-icon><small v-if="f.values[it.id].photos.length">{{ f.values[it.id].photos.length }}</small>
            </button>
          </span>
          <div v-if="openPhoto[it.id] || (isNG(it) && f.ngPhoto && !f.values[it.id].photos.length)" class="p-photos">
            <PhotoCell :photos="f.values[it.id].photos" :item-name="it.code+' '+it.name" :form-no="f.no" :inspector="f.inspector" :readonly="!editable" :min="isNG(it)&&f.ngPhoto?1:0" compact />
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
