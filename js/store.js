/* ============================================================
 * 质检数字化管理系统 · 原型数据层
 * 模版按公司现行表单建立：
 *   SL/QR-35    进料检验报告（玻璃杯-透明）
 *   SL/QR-36-02 杯蜡在线巡检稽查表
 *   SL/QR-38    成品检验报告
 * 原型阶段数据存在浏览器本地（localStorage），正式版换成后端 API。
 * ============================================================ */
const { reactive, watch } = Vue;

/* ---------- 字典 ---------- */
const TYPES = {
  IQC: { name: 'IQC 进料检验', short: '进料', vi: 'Kiểm tra nguyên liệu đầu vào', color: '#2f6fd6', bg: '#e8f0fc' },
  IPQC: { name: 'IPQC 在线巡检', short: '巡检', vi: 'Tuần kiểm trên chuyền', color: '#c27a12', bg: '#fbf1e1' },
  FQC: { name: 'FQC 成品检验', short: '成品', vi: 'Kiểm nghiệm thành phẩm', color: '#18885a', bg: '#e3f4ec' },
};
const STATUS = {
  draft: { label: '草稿', tag: 'info' },
  submitted: { label: '待审核', tag: 'warning' },
  returned: { label: '已退回', tag: 'danger' },
  approved: { label: '已审核', tag: 'success' },
};
const ROLES = {
  inspector: { name: '检验员', user: '张伟', dept: '品质部-检验组' },
  supervisor: { name: 'QC 主管', user: '李娜', dept: '品质部' },
  manager: { name: '质量经理', user: '王强', dept: '品质部' },
  admin: { name: '系统管理员', user: 'admin', dept: '信息部' },
  viewer: { name: '只读用户', user: '陈静(采购)', dept: '采购部' },
};
/* 缺陷等级（表单上的 CR / MAJ / MIN） */
const LEVELS = {
  CR: { zh: '致命', vi: 'Đặc biệt nghiêm trọng', color: '#c0392b', bg: '#fbe9e7' },
  MAJ: { zh: '严重', vi: 'Nghiêm trọng', color: '#b26a00', bg: '#fdf1df' },
  MIN: { zh: '轻微', vi: 'Nhẹ', color: '#2f6fd6', bg: '#e8f0fc' },
};
const LEVEL_KEYS = ['CR', 'MAJ', 'MIN'];
/* 检验结果：合格 / 不合格 / 待定 */
const RESULTS = {
  OK: { zh: '合格', vi: 'Đạt' },
  NG: { zh: '不合格', vi: 'Không đạt' },
  HOLD: { zh: '待定', vi: 'Đang chờ quyết định' },
};
/* 物料评估 / 处置方式（进料表上的选项原样保留） */
const DISPOSITIONS = {
  IQC: ['本厂返工使用', '本厂挑选使用', '退货', '其他'],
  IPQC: ['停线整改', '调整工艺参数', '返工', '其他'],
  FQC: ['返工', '挑选', '特采放行', '报废', '其他'],
};
const SAMPLING_METHODS = ['MIL-STD-105E II', 'MIL-STD-105E I', '全检', '其他'];
/* 字段类型 */
const FIELD_TYPES = {
  judge: { label: '判定项', icon: 'CircleCheck', desc: 'OK / NG / NA；NG 时填不良数和检查结果' },
  table: { label: '多样本实测', icon: 'Grid', desc: '如 5PCS × 尺寸，按规格型号带出标准值和 ±% 公差' },
  measure: { label: '实测值', icon: 'Aim', desc: '单个数值，设标准值与上下限' },
  check: { label: '巡检判定', icon: 'Finished', desc: '巡检表：每轮打 ✓ / ✗' },
  reading: { label: '巡检读数', icon: 'TrendCharts', desc: '巡检表：每轮记录温度、长度等数值' },
  number: { label: '数字', icon: 'Odometer', desc: '数量等' },
  text: { label: '文本', icon: 'EditPen', desc: '备注等' },
  photo: { label: '照片', icon: 'Camera', desc: '可设必拍与最少张数' },
  sign: { label: '签名', icon: 'Edit', desc: '手写签名' },
};
const isPatrol = it => it.type === 'check' || it.type === 'reading';

/* ---------- AQL：MIL-STD-105E（= GB/T 2828.1）一般检验水平 II，正常检验一次抽样 ---------- */
const AQL_LEVELS = [0.065, 0.1, 0.15, 0.25, 0.4, 0.65, 1.0, 1.5, 2.5, 4.0, 6.5];
const LOT_RANGES = [
  [2, 8, 'A', 2], [9, 15, 'B', 3], [16, 25, 'C', 5], [26, 50, 'D', 8], [51, 90, 'E', 13],
  [91, 150, 'F', 20], [151, 280, 'G', 32], [281, 500, 'H', 50], [501, 1200, 'J', 80],
  [1201, 3200, 'K', 125], [3201, 10000, 'L', 200], [10001, 35000, 'M', 315],
  [35001, 150000, 'N', 500], [150001, 500000, 'P', 800], [500001, Infinity, 'Q', 1250],
];
// 主表按对角线规律：d = 字码序号 + AQL 序号(0.65 记 0)；d=5 为 0/1，6 ↑，7 ↓，8 起 1/2…
const ACRE_BY_D = { 5: [0, 1], 8: [1, 2], 9: [2, 3], 10: [3, 4], 11: [5, 6], 12: [7, 8], 13: [10, 11], 14: [14, 15], 15: [21, 22] };
const LETTERS = [['A', 2], ['B', 3], ['C', 5], ['D', 8], ['E', 13], ['F', 20], ['G', 32], ['H', 50], ['J', 80], ['K', 125], ['L', 200], ['M', 315], ['N', 500], ['P', 800], ['Q', 1250]];
const LOT_BOUNDS = [8, 15, 25, 50, 90, 150, 280, 500, 1200, 3200, 10000, 35000, 150000, 500000, Infinity];
const LEVEL_LETTERS = { I: 'AABCCDEFGHJKLMN', II: 'ABCDEFGHJKLMNPQ' }; // 一般检验水平 I / II 的样本字码
function lotLetterIdx(lotSize, level = 'II') {
  if (lotSize < 2) return -1;
  const i = LOT_BOUNDS.findIndex(b => lotSize <= b);
  return i < 0 ? -1 : LETTERS.findIndex(l => l[0] === LEVEL_LETTERS[level][i]);
}
function lotLetter(lotSize, level = 'II') { const li = lotLetterIdx(lotSize, level); return li < 0 ? null : [0, 0, LETTERS[li][0], LETTERS[li][1]]; }
function aqlPlan(lotSize, aql, level = 'II') {
  lotSize = Number(lotSize) || 0;
  let li = lotLetterIdx(lotSize, level);
  const ai = AQL_LEVELS.indexOf(Number(aql)) - AQL_LEVELS.indexOf(0.65);
  if (li < 0 || ai < -5) return null;
  for (let guard = 0; guard < 30; guard++) {
    const d = li + ai;
    if (ACRE_BY_D[d]) { const [code, n] = LETTERS[li]; return { code, n: Math.min(n, lotSize), ac: ACRE_BY_D[d][0], re: ACRE_BY_D[d][1] }; }
    if (d < 5 || d === 7) li++; else li--;
    if (li < 0 || li >= LETTERS.length) return null;
  }
  return null;
}

/* ---------- 工具 ---------- */
let _seed = 20261123;
function rnd() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const pad = (n, l = 2) => String(n).padStart(l, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymdCompact = d => ymd(d).replace(/-/g, '');
const nowStr = (d = new Date()) => `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const hm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const uid = () => Math.random().toString(36).slice(2, 9);
const clone = o => JSON.parse(JSON.stringify(o));
const filled = x => x !== null && x !== undefined && x !== '' && !(typeof x === 'number' && isNaN(x));

function placeholderPhoto(label, hue = 210) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},18%,78%)"/><stop offset="1" stop-color="hsl(${hue},14%,58%)"/></linearGradient></defs>
<rect width="320" height="240" fill="url(#g)"/><path d="M128 60h64l-6 110a12 12 0 0 1-12 11h-28a12 12 0 0 1-12-11z" fill="none" stroke="#fff" stroke-width="5" opacity=".75"/>
<line x1="160" y1="44" x2="160" y2="80" stroke="#fff" stroke-width="4" opacity=".75"/>
<rect y="196" width="320" height="44" fill="#000" opacity=".45"/>
<text x="12" y="214" font-size="13" fill="#fff" font-family="sans-serif">示例照片 · ${label}</text>
<text x="12" y="231" font-size="11" fill="#fff" opacity=".8" font-family="sans-serif">原型演示数据</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
/* 照片地址：演示照片只存标签，显示时再生成，节省浏览器存储 */
const _phCache = new Map();
function srcOf(p) {
  if (!p) return '';
  if (p.src) return p.src;
  const k = p.ph + '|' + p.hue;
  if (!_phCache.has(k)) _phCache.set(k, placeholderPhoto(p.ph, p.hue));
  return _phCache.get(k);
}

/* ---------- 基础数据（演示用，正式上线时从 Excel 导入） ---------- */
const MASTER = {
  company: 'DEMO CO.,LTD 示例公司',
  suppliers: [
    { code: 'S001', name: '鸿昌玻璃制品有限公司', category: '玻璃杯', contact: '刘经理', grade: 'A' },
    { code: 'S002', name: '佳美玻璃厂', category: '玻璃杯', contact: '周先生', grade: 'B' },
    { code: 'S003', name: '南方蜡业有限公司', category: '蜡', contact: '吴小姐', grade: 'A' },
    { code: 'S004', name: '明亮灯芯厂', category: '灯芯', contact: '郑工', grade: 'B' },
    { code: 'S005', name: '宏达包装材料有限公司', category: '包材', contact: '孙经理', grade: 'C' },
  ],
  materials: [
    { code: 'M-GL-01', name: '玻璃杯（透明）', vi: 'Ly thủy tinh (trong suốt)', spec: 'GL-8OZ 直身杯 Φ78×85', unit: 'PCS', supplier: 'S001', dims: { height: 85, mouth: 78, wall: 3.0, weight: 230 } },
    { code: 'M-GL-02', name: '玻璃杯（磨砂）', vi: 'Ly thủy tinh (mờ)', spec: 'GL-12OZ 直身杯 Φ90×100', unit: 'PCS', supplier: 'S002', dims: { height: 100, mouth: 90, wall: 3.5, weight: 320 } },
    { code: 'M-WX-01', name: '大豆蜡', vi: 'Sáp đậu nành', spec: '464 片状 20kg/箱', unit: 'KG', supplier: 'S003', dims: { size: 5, weight: 20000 } },
    { code: 'M-WK-01', name: '棉芯灯芯', vi: 'Tim đèn cotton', spec: 'CD-10 带底座 150mm', unit: 'PCS', supplier: 'S004', dims: { size: 150, weight: 0.8 } },
    { code: 'M-PK-01', name: '彩盒', vi: 'Hộp màu', spec: '8oz 四色印刷', unit: 'PCS', supplier: 'S005', dims: { size: 120, weight: 45 } },
    { code: 'M-PK-02', name: '外箱', vi: 'Thùng carton', spec: '五层瓦楞 12 入', unit: 'PCS', supplier: 'S005', dims: { size: 400, weight: 650 } },
  ],
  products: [
    { code: 'P-01', itemNo: 'SC-8-LV', name: '香薰杯蜡 8oz（透明杯·薰衣草）', spec: 'SC-8-LV 单芯 净重 200g', customer: 'C01', wick: 1, dims: { height: 85, mouth: 78, liquid: 70, net: 200, volume: 237 } },
    { code: 'P-02', itemNo: 'SC-12-VN', name: '香薰杯蜡 12oz（磨砂杯·香草）', spec: 'SC-12-VN 双芯 净重 320g', customer: 'C02', wick: 2, dims: { height: 100, mouth: 90, liquid: 82, net: 320, volume: 355 } },
  ],
  customers: [
    { code: 'C01', name: '客户 A', portal: true },
    { code: 'C02', name: '客户 B', portal: false },
  ],
  processes: ['蘸灯芯', '压制蜡柱', '灌装', '包装'],
  workshops: ['一车间', '二车间'],
  defects: [
    { code: 'D01', name: '破裂/缺口', level: 'CR' }, { code: 'D02', name: '杂质', level: 'MAJ' },
    { code: 'D03', name: '尺寸超差', level: 'MAJ' }, { code: 'D04', name: '重量不符', level: 'MAJ' },
    { code: 'D05', name: '唛头/标签错误', level: 'CR' }, { code: 'D06', name: '包装破损', level: 'MAJ' },
    { code: 'D07', name: '装箱数错误', level: 'CR' }, { code: 'D08', name: '条码无法验证', level: 'CR' },
    { code: 'D09', name: '异物', level: 'CR' }, { code: 'D10', name: '蜡身裂纹', level: 'MAJ' },
    { code: 'D11', name: '脏污/粘壁', level: 'MIN' }, { code: 'D12', name: '表面不平/起花', level: 'MAJ' },
    { code: 'D13', name: '起泡', level: 'MAJ' }, { code: 'D14', name: '灯芯偏位/散头', level: 'MAJ' },
    { code: 'D15', name: '颜色/香味不符', level: 'CR' }, { code: 'D16', name: '液面高度不符', level: 'CR' },
    { code: 'D17', name: '燃烧测试不合格', level: 'CR' },
  ],
};

/* ---------- 模版 ---------- */
function I(name, type, o = {}) {
  return { id: o.id || uid(), code: '', group: '', groupVi: '', name, vi: '', level: 'MAJ', type, sampling: 'aql', required: true, mustPhoto: false, minPhotos: 1, unit: '', remark: '', remarkVi: '', ...o };
}
const G = (code, zh, vi) => ({ group: code ? `${code} ${zh}` : zh, groupVi: vi });

/* 基础信息照片：每张单据必拍，合格也要拍 */
const BP = (key, name, vi, min = 1) => ({ key, name, vi, min });
const BASE_IQC = () => [BP('pack', '来料外包装及标签', 'Bao bì và nhãn hàng nhập'), BP('doc', '送货单 / 供应商出货报告', 'Phiếu giao hàng / Báo cáo xuất hàng'), BP('sample', '抽检样品全貌', 'Toàn bộ mẫu rút kiểm')];
const BASE_IPQC = () => [BP('line', '生产线现场', 'Hiện trường chuyền sản xuất'), BP('first', '当班首件产品', 'Sản phẩm đầu tiên của ca')];
/* 成品照片清单：参考第三方验货报告的常见分类（货物与抽样 → 外箱 → 包装 → 产品 → 测量与测试，缺陷照片自动汇总）。
   covers：这张照片同时作为哪些检验项的证据，拍完自动引用过去，不用重复拍 */
const PG = (group, groupVi) => (key, name, vi, hint, covers = [], min = 1) => ({ key, name, vi, hint, covers, min, group, groupVi });
const BASE_FQC = () => {
  const g1 = PG('一、货物与抽样', 'Hàng hóa & rút mẫu'), g2 = PG('二、外箱', 'Thùng carton'), g3 = PG('三、产品包装', 'Đóng gói sản phẩm');
  const g4 = PG('四、产品', 'Sản phẩm'), g5 = PG('五、测量与测试', 'Đo lường & thử nghiệm');
  return [
    g1('pile', '大货货堆', 'Ảnh chồng hàng loạt', '拍全货堆，能看出堆放和总箱数'),
    g1('pick', '随机抽箱', 'Rút thùng ngẫu nhiên', '所抽箱子排开，箱上写明箱号'),
    g2('mark1', '外箱正唛', 'Tem thùng mặt chính', '唛头文字、条码完整可读', ['A1', 'A5']),
    g2('mark2', '外箱侧唛', 'Tem thùng mặt bên', '侧唛内容完整可读', ['A1']),
    g2('csize', '外箱尺寸测量', 'Đo kích thước thùng', '卷尺贴箱边，拍到读数', ['A6']),
    g2('cweight', '外箱毛重', 'Trọng lượng thùng', '整箱放秤上，拍到秤读数'),
    g2('open', '开箱：箱内装箱状况', 'Mở thùng: cách đóng gói bên trong', '打开后从上往下拍，看清装箱方式和数量', ['A2', 'A3', 'A4']),
    g2('drop', '摔箱测试', 'Thử thả rơi thùng', '拍摔箱后外箱和箱内产品状况', ['A7']),
    g3('box1', '彩盒正面', 'Hộp màu mặt trước', '印刷清晰、颜色与样品一致', ['B1', 'B2', 'B3']),
    g3('box2', '彩盒背面、侧面', 'Hộp màu mặt sau, mặt bên', '文字、图案、条码完整', ['B4']),
    g3('label', '标签与条码（含扫描结果）', 'Tem nhãn & mã vạch (kèm kết quả quét)', '标签贴在正确位置；扫描结果一起拍', ['B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12']),
    g3('warn', '警示标签', 'Tem cảnh báo', '蜡烛安全警示语完整、贴牢'),
    g4('compare', '大货与样品对比', 'So sánh hàng loạt với mẫu', '样品和大货并排，标明哪个是样品', ['D', 'F2', 'G21', 'G22']),
    g4('front', '产品正面', 'Sản phẩm mặt trước', '整体外观，看清表面', ['C1', 'C2', 'C3', 'C4', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', 'G18', 'G19', 'G20']),
    g4('side', '产品侧面、底部（底部标签）', 'Mặt bên, mặt đáy (tem đáy)', '底部标签内容可读'),
    g4('wick', '灯芯俯视', 'Tim đèn nhìn từ trên', '从正上方拍，看灯芯是否居中；放尺子量长度', ['G15', 'G16', 'G17']),
    g5('msize', '尺寸测量', 'Đo kích thước', '卡尺量杯高、口径，拍到读数', ['E1']),
    g5('mweight', '称重', 'Cân trọng lượng', '电子秤去皮后称净重，拍到读数', ['E2']),
    g5('burn1', '燃烧测试：点燃后', 'Thử đốt: sau khi châm lửa', '点燃后正常燃烧的样子', ['F1']),
    g5('burn2', '燃烧测试：燃烧 1 小时后', 'Thử đốt: sau 1 giờ', '火焰高度、蜡池大小，有无黑烟', ['F1']),
  ];
};

const TPL_IQC_GLASS = {
  id: 'TPL-IQC-001', docNo: 'SL/QR-35', name: '进料检验报告（玻璃杯-透明）', nameVi: 'Báo cáo kiểm tra nguyên liệu đầu vào', type: 'IQC',
  version: 1, status: '已发布', updatedAt: '2026-11-06', bind: { materials: ['M-GL-01', 'M-GL-02'], processes: [] }, ngPhoto: true,
  itemPhoto: 'all', basePhotos: BASE_IQC(),
  plan: { method: 'MIL-STD-105E II', aql: { CR: 0, MAJ: 2.5, MIN: 2.5 }, fixed: { n: 5, ac: { CR: 0, MAJ: 1, MIN: 1 } } },
  note: '规格和性能检验按照 5PCS 每批次进行抽样，判定标准是：CR: 0 PCS；MAJ ≤ 1 PCS；MIN ≤ 1 PCS',
  noteVi: 'Kiểm nghiệm quy cách và tính năng thì rút kiểm mẫu 5 cái cho mỗi lô hàng, tiêu chuẩn quyết định là: CR: 0 PCS; MAJ ≤ 1 PCS; MIN ≤ 1 PCS',
  items: [
    I('外形尺寸', 'table', { id: 'q1', code: '1.1', ...G('1', '规格（5PCS）', 'Quy cách (5PCS)'), vi: 'Kích thước', level: 'MAJ', sampling: 'fixed', samples: 5,
      dims: [{ name: '杯高', key: 'height', pct: 3, std: 85 }, { name: '口径', key: 'mouth', pct: 3, std: 78 }],
      remark: '外形尺寸不得超出结构图规定的公差范围 ±3%', remarkVi: 'Kích thước không được vượt quá dung sai quy định trong bản vẽ kết cấu ±3%' }),
    I('杯壁厚度', 'table', { id: 'q2', code: '1.2', ...G('1', '规格（5PCS）', 'Quy cách (5PCS)'), vi: 'Độ dày thành ly', level: 'MAJ', sampling: 'fixed', samples: 5,
      dims: [{ name: '壁厚', key: 'wall', pct: 5, std: 3.0 }],
      remark: '杯壁厚度不得超过结构图规定的公差范围 ±5%', remarkVi: 'Độ dày miệng cốc không được vượt quá phạm vi dung sai quy định trong bản vẽ kết cấu ±5%' }),
    I('底部平稳、杯身不能破裂/缺口', 'judge', { id: 'q3', code: '2.1', ...G('2', '外观', 'Ngoại quan'), vi: 'Đáy ly ổn định, ly không nứt, miệng ly không mẻ', level: 'CR', mustPhoto: true }),
    I('杯身清澈无杂质', 'judge', { id: 'q4', code: '2.2', ...G('2', '外观', 'Ngoại quan'), vi: 'Ly trong suốt không tạp chất', level: 'MAJ' }),
    I('重量符合订单的要求', 'table', { id: 'q5', code: '3.1', ...G('3', '性能（5PCS）', 'Tính năng (5PCS)'), vi: 'Trọng lượng đáp ứng yêu cầu của đơn hàng', level: 'MAJ', sampling: 'fixed', samples: 5,
      dims: [{ name: '重量 g', key: 'weight', pct: 3, std: 230 }], remark: '公差 ±3%（待确认，可在模版中修改）' }),
  ],
};
const TPL_IQC_GENERAL = {
  id: 'TPL-IQC-099', docNo: 'SL/QR-35', name: '进料检验报告（通用）', nameVi: 'Báo cáo kiểm tra nguyên liệu đầu vào', type: 'IQC',
  version: 1, status: '已发布', updatedAt: '2026-11-06', bind: { materials: [], processes: [] }, isDefault: true, ngPhoto: true,
  itemPhoto: 'all', basePhotos: BASE_IQC(),
  plan: { method: 'MIL-STD-105E II', aql: { CR: 0, MAJ: 2.5, MIN: 2.5 }, fixed: { n: 5, ac: { CR: 0, MAJ: 1, MIN: 1 } } },
  note: '规格和性能检验按照 5PCS 每批次进行抽样，判定标准是：CR: 0 PCS；MAJ ≤ 1 PCS；MIN ≤ 1 PCS', noteVi: '',
  items: [
    I('尺寸符合规格书', 'table', { id: 'g1', code: '1.1', ...G('1', '规格（5PCS）', 'Quy cách (5PCS)'), vi: 'Kích thước đúng quy cách', level: 'MAJ', sampling: 'fixed', samples: 5, dims: [{ name: '尺寸 mm', key: 'size', pct: 3, std: null }], remark: '标准值按规格书带出，公差 ±3%（待确认）' }),
    I('重量符合规格书', 'table', { id: 'g5', code: '1.2', ...G('1', '规格（5PCS）', 'Quy cách (5PCS)'), vi: 'Trọng lượng đúng quy cách', level: 'MAJ', sampling: 'fixed', samples: 5, dims: [{ name: '重量 g', key: 'weight', pct: 3, std: null }], remark: '标准值按规格书带出，公差 ±3%（待确认）' }),
    I('外观无破损、污渍、异物', 'judge', { id: 'g2', code: '2.1', ...G('2', '外观', 'Ngoại quan'), vi: 'Ngoại quan không hư hỏng, bẩn, dị vật', level: 'MAJ', mustPhoto: true }),
    I('包装标识正确', 'judge', { id: 'g3', code: '2.2', ...G('2', '外观', 'Ngoại quan'), vi: 'Nhãn mác bao bì chính xác', level: 'MIN' }),
    I('性能符合订单要求', 'judge', { id: 'g4', code: '3.1', ...G('3', '性能（5PCS）', 'Tính năng (5PCS)'), vi: 'Tính năng đáp ứng yêu cầu đơn hàng', level: 'MAJ', sampling: 'fixed' }),
  ],
};
function patrolItems() {
  const B = G('', '蘸灯芯', 'Nhúng tim đèn'), C = G('', '压制蜡柱', 'Sáp trụ ép chế'), D = G('', '灌装', 'Chế sáp');
  const c = (code, lv, name, vi, grp, o = {}) => I(name, 'check', { id: 'p' + code, code, level: lv, vi, ...grp, ...o });
  const r = (code, lv, name, vi, unit, grp, o = {}) => I(name, 'reading', { id: 'p' + code, code, level: lv, vi, unit, lo: null, hi: null, ...grp, ...o });
  return [
    c('B1', 'MAJ', '灯芯型号（多少股）', 'Loại tim đèn (bao nhiêu sợi)', B),
    r('B2', 'MIN', '沾蜡槽温度', 'Nhiệt độ máng sáp nhúng', '℃', B),
    c('B3', 'MIN', '蜡槽无杂质', 'Máng sáp không tạp chất', B),
    r('B4', 'MIN', '沾蜡遍数', 'Số lần nhúng sáp', '遍', B),
    c('B5', 'CR', '蘸前蘸后灯芯标识是否完整', 'Đánh dấu tim đèn trước và sau khi nhúng sáp có hoàn chỉnh không', B),
    c('C1', 'MIN', '蜡粉质量（干净，无杂质，颗粒合适）', 'Chất lượng sáp bột (sạch sẽ, ko tạp chất, viên thích hợp)', C),
    c('C2', 'MAJ', '蜡粉颜色香味是否正确', 'Màu sắc mùi vị sáp bột có chính xác không', C),
    c('C3', 'MAJ', '蜡柱质量（蜡柱高度，完整度）', 'Chất lượng sáp trụ (độ cao sáp trụ, độ hoàn chỉnh)', C),
    c('C4', 'MAJ', '灯芯型号（多少股）', 'Loại tim đèn (bao nhiêu sợi)', C),
    r('C5', 'MIN', '灯芯长度', 'Độ dài tim đèn', 'mm', C),
    c('C6', 'MIN', '底座型号', 'Loại đế', C),
    c('C7', 'MIN', '胎膜质量', 'Chất lượng khuôn', C),
    c('C8', 'MAJ', '粘灯芯质量（居中）', 'Chất lượng dán tim đèn', C),
    r('D1', 'MIN', '预热温度', 'Nhiệt độ làm nóng trước', '℃', D),
    r('D2', 'MAJ', '灌蜡温度', 'Nhiệt độ chế sáp', '℃', D),
    r('D3', 'MIN', '一次灌装液面高度', 'Độ cao mặt sáp chế 1 lần', 'mm', D),
    r('D4', 'MIN', '保温车蜡温', 'Nhiệt độ sáp trong xe giữ nhiệt', '℃', D),
    c('D5', 'MAJ', '保温车清洁度', 'Độ sạch sẽ của xe giữ nhiệt', D),
    r('D6', 'MIN', '网带线速', 'Tốc độ chuyền sản xuất', 'm/min', D),
    r('D7', 'MIN', '补蜡时间', 'Thời gian bù sáp', 'min', D),
    r('D8', 'MAJ', '补蜡温度', 'Nhiệt độ bù sáp', '℃', D),
    r('D9', 'MIN', '烤平深度', 'Độ sâu hơ làm bằng', 'mm', D),
    r('D10', 'MAJ', '最终产品液面高度', 'Độ cao mặt sáp lỏng', 'mm', D, { key: 'liquid', pct: 3, remark: '按产品规格 ±3%（待确认）' }),
    c('D11', 'MIN', '剖体', 'Xẻ thân', D),
    r('D12', 'MAJ', '称重（净重）', 'Lượng cân (trọng lượng tịnh)', 'g', D, { key: 'net', pct: 3, remark: '按产品净重 ±3%（待确认）' }),
    r('D13', 'MIN', '灯芯长度', 'Độ dài tim đèn', 'mm', D),
    c('D14', 'MAJ', '灯芯是否有散头', 'Đầu tim đèn có bị tua không', D),
    c('D15', 'MAJ', '蜡是否有掉蜡块现象', 'Sáp có hiện tượng rớt sáp miếng không', D),
    c('D16', 'MAJ', '蜡身起泡', 'Thân nến nổi bong bóng', D),
    c('D17', 'MAJ', '产品外观（表面平整、无污渍、无杂质）', 'Ngoại quan sản phẩm (bề mặt phẳng, sạch, không tạp chất)', D, { remark: '纸质表外新增' }),
  ];
}
const TPL_IPQC = {
  id: 'TPL-IPQC-001', docNo: 'SL/QR-36-02', name: '杯蜡在线巡检稽查表', nameVi: 'Bảng kiểm tra tuần kiểm sáp ly trên chuyền', type: 'IPQC',
  version: 1, status: '已发布', updatedAt: '2026-11-03', bind: { materials: [], processes: [] }, isDefault: true, ngPhoto: true,
  patrol: { rounds: 6, perRound: 10, intervalH: 2, roundPhoto: 1 },
  itemPhoto: 'ng', basePhotos: BASE_IPQC(),
  note: '每 2 小时巡检 1 次；每次抽查 10 PCS', noteVi: 'Mỗi 2 giờ tuần kiểm 1 lần, mỗi lần rút kiểm 10 cái',
  items: patrolItems(),
};
function fqcItems() {
  // 检验项目 → name/vi；标准 → remark/remarkVi；等级写「MAJ/MIN」的项由检验员判 NG 时选择
  const j = (code, grp, name, vi, std, stdVi, lv, o = {}) => {
    const levels = lv.includes('/') ? lv.split('/') : null;
    return I(name, 'judge', { id: 'f' + code, code, ...grp, vi, remark: std, remarkVi: stdVi, level: levels ? levels[0] : lv, levels, short: `${name}·${std}`, ...o });
  };
  const other = (code, grp) => I('其他', 'judge', { id: 'f' + code, code, ...grp, vi: 'Khác', level: 'MAJ', levels: ['CR', 'MAJ', 'MIN'], other: true, required: false, short: '其他', remark: '检验员自填项目和标准，不用可留空' });
  const A = G('A', '外箱', 'Thùng carton'), B = G('B', '产品包装', 'Đóng gói sản phẩm (Tham khảo bản mẫu của khách hàng)'), C = G('C', '安全性', 'Tính an toàn');
  const D = G('D', '材质', 'Chất liệu'), E = G('E', '规格', 'Quy cách'), F = G('F', '功能', 'Chức năng'), GG = G('G', '外观', 'Ngoại quan');
  const P5 = '与订单要求和样品要求一致，无特殊要求按 ±5% 执行', P5vi = 'Đúng yêu cầu đơn hàng và mẫu; không có yêu cầu đặc biệt thì áp dụng +/-5%';
  const tbl = dims => ({ type: 'table', samples: 5, dims });
  const BOX = ['彩盒', 'Hộp màu'], LBL = ['标签', 'Tem nhãn'], SURF = ['表面', 'Bề mặt'], WICK = ['灯芯', 'Tim đèn'], POST = ['喷涂烤花电镀等后加工', 'Gia công sau (phun sơn, decal nung, mạ điện…)'];
  return [
    j('A1', A, '印刷内容', 'Nội dung in', '印刷正确', 'In đúng', 'CR'),
    j('A2', A, '完整性', 'Tính nguyên vẹn', '完整无损坏', 'Nguyên vẹn, không hư hỏng', 'MAJ'),
    j('A3', A, '装箱率', 'Số lượng đóng thùng', '装箱率正确', 'Số lượng đóng gói đúng', 'CR'),
    j('A4', A, '装箱方式', 'Phương pháp đóng thùng', '装箱方式正确', 'Phương pháp đóng gói đúng', 'MAJ'),
    j('A5', A, '条码', 'Mã vạch', '条码可以扫描', 'Mã vạch quét được', 'CR'),
    j('A6', A, '外箱尺寸', 'Kích thước thùng carton', '装入产品后大小合适', 'Kích thước vừa vặn sau khi cho sản phẩm vào', 'MAJ'),
    j('A7', A, '摔箱', 'Thả rơi thùng', '摔箱无破损', 'Thả thùng không hư hỏng', 'CR'),
    other('A8', A),
    j('B1', B, ...BOX, '尺寸正确', 'Kích thước đúng', 'MAJ'),
    j('B2', B, ...BOX, '印刷清晰', 'In rõ nét', 'MIN'),
    j('B3', B, ...BOX, '印刷正确', 'In đúng', 'CR'),
    j('B4', B, ...BOX, '条码可读', 'Mã vạch đọc được', 'CR'),
    j('B5', B, ...LBL, '尺寸正确', 'Kích thước đúng', 'MAJ'),
    j('B6', B, ...LBL, '印刷清晰', 'In rõ nét', 'MIN'),
    j('B7', B, ...LBL, '印刷正确', 'In đúng', 'CR'),
    j('B8', B, ...LBL, '条码可读', 'Mã vạch đọc được', 'CR'),
    j('B9', B, ...LBL, '粘贴位置正确', 'Vị trí dán đúng', 'MAJ/MIN'),
    j('B10', B, ...LBL, '不翘边', 'Không bong mép', 'MIN'),
    j('B11', B, ...LBL, '没有磨损', 'Không trầy mòn', 'MAJ/MIN'),
    j('B12', B, ...LBL, '没有脏污', 'Không bẩn', 'MAJ/MIN'),
    other('B13', B), other('B14', B),
    j('C1', C, '安全性-不易识别', 'An toàn - khó nhận biết', '没有隐藏的尖锐物品及可以伤人的物质', 'Không có vật sắc nhọn ẩn hoặc chất có thể gây thương tích', 'CR'),
    j('C2', C, '安全性-容易识别', 'An toàn - dễ nhận biết', '无破损', 'Không vỡ, không hư hỏng', 'MAJ'),
    j('C3', C, '安全性-容易识别', 'An toàn - dễ nhận biết', '无磕碰', 'Không va đập, sứt mẻ', 'MAJ'),
    j('C4', C, '安全性-容易识别', 'An toàn - dễ nhận biết', '无尖边利角', 'Không có cạnh sắc, góc nhọn', 'MAJ'),
    j('D', D, '材质', 'Chất liệu', '与订单要求和样品要求一致', 'Đúng yêu cầu đơn hàng và mẫu', 'MAJ'),
    j('E1', E, '尺寸', 'Kích thước', P5, P5vi, 'MAJ', tbl([{ name: '杯高 mm', key: 'height', pct: 5, std: 85 }, { name: '口径 mm', key: 'mouth', pct: 5, std: 78 }])),
    j('E2', E, '重量', 'Trọng lượng', P5, P5vi, 'MAJ', tbl([{ name: '净重 g', key: 'net', pct: 5, std: 200 }])),
    j('E3', E, '容量', 'Dung tích', P5, P5vi, 'MAJ', tbl([{ name: '容量 ml', key: 'volume', pct: 5, std: 237 }])),
    j('F1', F, '燃烧', 'Đốt cháy', '燃烧合格', 'Đốt cháy đạt', 'CR'),
    j('F2', F, '香味', 'Mùi hương', '香味与订单要求和样品要求一致', 'Mùi hương đúng yêu cầu đơn hàng và mẫu', 'CR'),
    j('G1', GG, '异物', 'Dị vật', '没有蚊虫', 'Không có côn trùng', 'CR'),
    j('G2', GG, '异物', 'Dị vật', '没有血迹', 'Không có vết máu', 'CR'),
    j('G3', GG, '异物', 'Dị vật', '没有刀片等尖锐物体', 'Không có lưỡi dao hoặc vật sắc nhọn', 'CR'),
    j('G4', GG, '异物', 'Dị vật', '没有其他异物', 'Không có dị vật khác', 'MAJ'),
    j('G5', GG, '整洁', 'Sạch sẽ', '表面无脏污', 'Bề mặt không bẩn', 'MAJ/MIN'),
    j('G6', GG, ...SURF, '无滴蜡', 'Không có giọt sáp', 'MAJ/MIN'),
    j('G7', GG, ...SURF, '平整无凹陷', 'Phẳng, không lõm', 'MAJ/MIN'),
    j('G8', GG, ...SURF, '没有锯齿状边缘', 'Không có mép răng cưa', 'MAJ/MIN'),
    j('G9', GG, ...SURF, '无粘壁发白', 'Không dính thành cốc bị trắng', 'MAJ/MIN'),
    j('G10', GG, ...SURF, '无气泡', 'Không có bọt khí', 'MAJ/MIN'),
    j('G11', GG, ...SURF, '无划伤', 'Không trầy xước', 'MAJ/MIN'),
    j('G12', GG, ...SURF, '无香精析出', 'Không chảy tinh dầu', 'MAJ/MIN'),
    j('G13', GG, ...SURF, '无螺纹', 'Không có vân gợn', 'MAJ/MIN'),
    j('G14', GG, ...SURF, '无胶丝', 'Không có sợi keo', 'MAJ/MIN'),
    j('G15', GG, ...WICK, '灯芯型号正确', 'Loại tim đèn đúng', 'MAJ'),
    j('G16', GG, ...WICK, '位置居中；不偏离要求位置的 2%', 'Tim nằm giữa; lệch không quá 2% so với vị trí yêu cầu', 'MAJ'),
    j('G17', GG, ...WICK, '灯芯长度 8–12mm', 'Chiều dài tim đèn 8-12mm', 'MAJ/MIN', tbl([{ name: '灯芯长度 mm', std: 10, lo: 8, hi: 12 }])),
    j('G18', GG, ...POST, '无划伤', 'Không trầy xước', 'MAJ/MIN'),
    j('G19', GG, ...POST, '无缺失', 'Không thiếu sót', 'MAJ/MIN'),
    j('G20', GG, ...POST, '附着力合格', 'Độ bám dính đạt', 'MAJ/MIN'),
    j('G21', GG, ...POST, '颜色与订单/样品一致', 'Màu sắc đúng đơn hàng/mẫu', 'MAJ/MIN'),
    j('G22', GG, ...POST, '图案与订单/样品一致', 'Hoa văn đúng đơn hàng/mẫu', 'MAJ'),
    other('G23', GG), other('G24', GG), other('G25', GG),
  ];
}
const TPL_FQC = {
  id: 'TPL-FQC-001', docNo: 'SL/QR-38', name: '成品检验报告', nameVi: 'Báo cáo kiểm nghiệm thành phẩm', type: 'FQC',
  version: 2, status: '已发布', updatedAt: '2026-11-24', bind: { materials: [], processes: [] }, isDefault: true, ngPhoto: true,
  plan: { method: 'MIL-STD-105E I', aql: { CR: 0, MAJ: 2.5, MIN: 4.0 } },
  itemPhoto: 'all', basePhotos: BASE_FQC(),
  note: 'E1 尺寸、E2 重量、E3 容量实测 5PCS，无特殊要求按 ±5%。表上 MAJ / MIN 的 AQL 为空白，原型暂按 MAJ 2.5、MIN 4.0，可在模版中修改。等级写「MAJ/MIN」的项由检验员按实际情况选择。',
  noteVi: 'E1 kích thước, E2 trọng lượng, E3 dung tích đo thực tế 5PCS; không có yêu cầu đặc biệt thì áp dụng +/-5%.',
  items: fqcItems(),
};
const DEFAULT_TEMPLATES = [TPL_IQC_GLASS, TPL_IQC_GENERAL, TPL_IPQC, TPL_FQC];

/* ---------- 单据核心逻辑 ---------- */
function supplierName(code) { return (MASTER.suppliers.find(s => s.code === code) || {}).name || ''; }
function materialOf(code) { return MASTER.materials.find(s => s.code === code) || MASTER.products.find(s => s.code === code); }
function materialName(code) { return (materialOf(code) || {}).name || ''; }
function customerName(code) { return (MASTER.customers.find(s => s.code === code) || {}).name || ''; }
function defectName(code) { const d = MASTER.defects.find(x => x.code === code); return d ? `${d.code} ${d.name}` : ''; }
function itemLabel(it) { return (it.code ? it.code + ' ' : '') + (it.short || it.name); }
function sizeText(p) { return p && p.dims && p.dims.mouth ? `Φ${p.dims.mouth}×${p.dims.height}mm` : ''; }

function newFormSkeleton(type, no, date = new Date()) {
  return {
    no, type, date: ymd(date), status: 'draft', result: null, suggest: null,
    header: {
      supplier: '', material: '', spec: '', qty: null, receiveDate: ymd(date), order: '', lot: '',
      customer: '', product: '', method: 'MIL-STD-105E II', customN: null, size: '', visit: '首次',
      workshop: '', orderQty: null, temp: null, humidity: null, page: 1, remark: '',
    },
    tplId: '', tplVersion: null, tplName: '', docNo: '', tplPlan: null, tplPatrol: null, tplNote: '', tplNoteVi: '', ngPhoto: true,
    itemPhoto: 'ng', roundPhoto: 0, basePhotoDefs: [], basePhotos: {},
    items: [], values: {}, plan: null, rounds: [], problems: [],
    inspector: '', reviewer: '', reviewComment: '', submittedAt: '', reviewedAt: '', ncrNo: '', ncrResult: '',
    defects: 0, photoCount: 0, mainDefect: '', levelCount: null,
  };
}

/** 按物料/工序自动匹配模版（模版驱动） */
function matchTemplate(f, templates) {
  const pub = templates.filter(t => t.type === f.type && t.status === '已发布');
  const h = f.header;
  return pub.find(t => h.material && t.bind.materials.includes(h.material))
    || pub.find(t => h.workshop && t.bind.processes.includes(h.workshop))
    || pub.find(t => t.isDefault) || pub[0];
}
function blankValue(it, rounds = 0) {
  return {
    value: null, judge: '', qty: null, note: '', defect: '', photos: [], sign: '', level: '', otherName: '',
    rows: it.type === 'table' ? Array.from({ length: it.samples || 5 }, () => (it.dims || []).map(() => null)) : null,
    cells: isPatrol(it) ? Array.from({ length: rounds }, () => ({ v: it.type === 'check' ? '' : null, ng: false })) : null,
  };
}
/** 套用模版：复制当时版本的检验项（历史单据保留当时版本） */
function applyTemplate(f, templates, tpl) {
  tpl = tpl || matchTemplate(f, templates);
  if (!tpl) return;
  Object.assign(f, {
    tplId: tpl.id, tplVersion: tpl.version, tplName: tpl.name, docNo: tpl.docNo || '', ngPhoto: tpl.ngPhoto !== false,
    tplPlan: tpl.plan ? clone(tpl.plan) : null, tplPatrol: tpl.patrol ? clone(tpl.patrol) : null,
    tplNote: tpl.note || '', tplNoteVi: tpl.noteVi || '', items: clone(tpl.items), values: {},
  });
  f.items.forEach(it => { f.values[it.id] = blankValue(it, f.rounds.length); });
  // 基础信息照片：换模版时同名照片位保留已拍的照片
  const old = f.basePhotos || {};
  f.basePhotoDefs = clone(tpl.basePhotos || []);
  f.basePhotos = {}; f.basePhotoDefs.forEach(d => { f.basePhotos[d.key] = old[d.key] || []; });
  f.itemPhoto = tpl.itemPhoto || 'ng';
  f.roundPhoto = (tpl.patrol && tpl.patrol.roundPhoto) || 0;
  if (tpl.plan) f.header.method = tpl.plan.method;
  resolveSpec(f);
}
/** 按规格型号带出标准值，按 ±% 算上下限 */
function resolveSpec(f) {
  const m = materialOf(f.header.material || f.header.product);
  const dims = (m && m.dims) || {};
  f.items.forEach(it => (it.dims || []).forEach(d => {
    if (d.key && dims[d.key] !== undefined) d.std = dims[d.key];
    if (d.pct !== undefined && d.pct !== null && filled(d.std)) {
      d.lo = +(d.std * (1 - d.pct / 100)).toFixed(3); d.hi = +(d.std * (1 + d.pct / 100)).toFixed(3);
    }
  }));
  // 巡检读数（液面高度、称重等）也按产品规格带出标准值和上下限
  f.items.forEach(it => {
    if (it.type !== 'reading' || !it.key || dims[it.key] === undefined) return;
    it.std = dims[it.key];
    if (filled(it.pct)) { it.lo = +(it.std * (1 - it.pct / 100)).toFixed(2); it.hi = +(it.std * (1 + it.pct / 100)).toFixed(2); }
  });
}
/** 抽样方案：按 CR / MAJ / MIN 各自的 AQL 算接收/拒收数 */
function recalcPlan(f) {
  if (f.type === 'IPQC' || !f.tplPlan) { f.plan = null; return; }
  const tp = f.tplPlan, h = f.header, qty = Number(h.qty) || 0;
  const method = h.method || tp.method;
  const prev = f.plan;
  let n = null, code = '', levels = {};
  if (method.startsWith('MIL-STD-105E')) {
    const lvl = method.endsWith(' I') ? 'I' : 'II';
    const r = qty >= 2 ? lotLetter(qty, lvl) : null;
    if (r) { code = r[2]; n = Math.min(r[3], qty); }
    LEVEL_KEYS.forEach(L => {
      const a = tp.aql[L];
      if (a === 0) levels[L] = { aql: 0, ac: 0, re: 1 };
      else { const p = aqlPlan(qty, a, lvl); levels[L] = p ? { aql: a, ac: p.ac, re: p.re } : { aql: a, ac: null, re: null }; }
    });
  } else if (method === '全检') {
    n = qty || null;
    levels = { CR: { aql: 0, ac: 0, re: 1 }, MAJ: { aql: '—', ac: null, re: null }, MIN: { aql: '—', ac: null, re: null } };
  } else {
    n = h.customN;
    levels = prev && prev.method === '其他' ? prev.levels : { CR: { aql: '—', ac: 0, re: 1 }, MAJ: { aql: '—', ac: 1, re: 2 }, MIN: { aql: '—', ac: 1, re: 2 } };
  }
  f.plan = { method, code, n, levels, fixed: tp.fixed ? clone(tp.fixed) : null };
}
function measureState(it, v) {
  if (!filled(v)) return '';
  return (Number(v) < it.lo || Number(v) > it.hi) ? 'NG' : 'OK';
}
function dimNG(d, x) { return filled(x) && filled(d.lo) && filled(d.hi) && (Number(x) < d.lo || Number(x) > d.hi); }
function tableStats(it, rows) {
  return (it.dims || []).map((d, j) => {
    const col = rows.map(r => r[j]).filter(filled).map(Number);
    if (!col.length) return { max: '', min: '', avg: '', ng: false };
    const r4 = x => +x.toFixed(4);
    return { max: r4(Math.max(...col)), min: r4(Math.min(...col)), avg: +(col.reduce((a, b) => a + b, 0) / col.length).toFixed(3), ng: col.some(x => dimNG(d, x)) };
  });
}
function cellFilled(it, c) { return !!c && (it.type === 'check' ? !!c.v : filled(c.v)); }
function cellNG(it, c) {
  if (!c) return false;
  if (it.type === 'check') return c.v === 'NG';
  if (c.ng) return true;
  if (!filled(c.v)) return false;
  return (filled(it.lo) && Number(c.v) < it.lo) || (filled(it.hi) && Number(c.v) > it.hi);
}
/** 单项判定 */
function itemResult(it, v) {
  if (it.type === 'measure') return measureState(it, v.value);
  if (it.type === 'judge') return v.judge;
  if (it.type === 'table') { const s = tableStats(it, v.rows || []); if (s.every(x => x.max === '')) return ''; return s.some(x => x.ng) ? 'NG' : 'OK'; }
  if (isPatrol(it)) { const cs = v.cells || []; if (cs.some(c => cellNG(it, c))) return 'NG'; return cs.some(c => cellFilled(it, c)) ? 'OK' : ''; }
  return '';
}
/** 这一项计多少个缺陷（填入 CR / MAJ / MIN 栏） */
function itemQty(it, v) {
  if (it.type === 'judge') return Math.max(1, Number(v.qty) || 1);
  if (it.type === 'table') return (v.rows || []).filter(r => r.some((x, j) => dimNG(it.dims[j], x))).length || 1;
  if (isPatrol(it)) return (v.cells || []).filter(c => cellNG(it, c)).length;
  return 1;
}
/** 这一项至少要几张照片：模版设「每项必拍」时合格也要拍；判 NA 的不用拍 */
function photoNeed(it, v, rule = {}) {
  const res = itemResult(it, v);
  let n = it.type === 'photo' ? (it.minPhotos || 1) : (it.mustPhoto ? (it.minPhotos || 1) : 0);
  if (rule.all && ['judge', 'measure', 'table'].includes(it.type) && !(it.other && !v.judge)) n = Math.max(n, 1);
  if (res === 'NG') n = Math.max(n, 1);
  if (res === 'NA') n = 0;
  return n;
}
function photoRule(f) { return { all: f.itemPhoto === 'all' }; }
/** 判 NG 必须有一张「不良部位」照片：当场新拍、标记为不良，引用的照片不算 */
const isDefectPhoto = p => p && p.defect && !p.ref;
function defectPhotoMissing(it, v) { return itemResult(it, v) === 'NG' && !(v.photos || []).some(isDefectPhoto); }
/** 清单照片自动引用到它能证明的检验项（标记为「引用」，不算不良照片） */
function linkCoverPhotos(f) {
  const pk = p => p.src || (p.ph + '|' + p.hue);
  (f.basePhotoDefs || []).forEach(d => (d.covers || []).forEach(code => {
    const it = f.items.find(x => x.code === code); if (!it) return;
    const v = f.values[it.id];
    (f.basePhotos[d.key] || []).forEach(p => {
      if (!v.photos.some(x => pk(x) === pk(p))) v.photos.push({ ...p, id: uid(), ref: true, from: d.name });
    });
  }));
}
/** 本单所有照片（供「选本单已拍」引用） */
function allPhotos(f) {
  const out = [];
  (f.basePhotoDefs || []).forEach(d => (f.basePhotos[d.key] || []).forEach(p => out.push({ ...p, from: d.name })));
  (f.rounds || []).forEach((r, k) => (r.photos || []).forEach(p => out.push({ ...p, from: `第${k + 1}轮 ${r.time}` })));
  f.items.forEach(it => (f.values[it.id].photos || []).forEach(p => out.push({ ...p, from: itemLabel(it) })));
  const seen = new Set();
  return out.filter(p => { const k = p.src || (p.ph + '|' + p.hue); if (seen.has(k)) return false; seen.add(k); return true; });
}
/** 纯计算，不改单据（页面实时显示用） */
function summarize(f) {
  const lv = { aql: { CR: 0, MAJ: 0, MIN: 0 }, fixed: { CR: 0, MAJ: 0, MIN: 0 } };
  let ngItems = 0, photos = 0, pTotal = 0, pNg = 0; const names = [];
  Object.values(f.basePhotos || {}).forEach(a => { photos += a.length; });
  (f.rounds || []).forEach(r => { photos += (r.photos || []).length; });
  f.items.forEach(it => {
    const v = f.values[it.id];
    photos += (v.photos || []).length;
    if (isPatrol(it)) (v.cells || []).slice(0, f.rounds.length).forEach(c => { if (cellFilled(it, c)) pTotal++; if (cellNG(it, c)) pNg++; });
    if (itemResult(it, v) === 'NG') {
      ngItems++; names.push(itemLabel(it));
      lv[it.sampling === 'fixed' ? 'fixed' : 'aql'][v.level || it.level || 'MAJ'] += itemQty(it, v);
    }
  });
  const total = { CR: lv.aql.CR + lv.fixed.CR, MAJ: lv.aql.MAJ + lv.fixed.MAJ, MIN: lv.aql.MIN + lv.fixed.MIN };
  const check = {}; // 每个等级是否超出接收数
  let suggest = 'OK';
  if (f.type === 'IPQC') suggest = pNg > 0 ? 'NG' : 'OK';
  else {
    const p = f.plan;
    LEVEL_KEYS.forEach(L => {
      let rej = false;
      if (p && p.levels[L] && filled(p.levels[L].re) && lv.aql[L] >= p.levels[L].re) rej = true;
      if (p && p.fixed && lv.fixed[L] > p.fixed.ac[L]) rej = true;
      check[L] = rej; if (rej) suggest = 'NG';
    });
  }
  return {
    ngItems, photoCount: photos, mainDefect: names.slice(0, 2).join('、') + (names.length > 2 ? ' 等' : ''),
    defects: f.type === 'IPQC' ? pNg : total.CR + total.MAJ + total.MIN, levelCount: { ...lv, total }, levelReject: check,
    patrolTotal: pTotal, patrolNg: pNg, patrolRate: pTotal ? +(pNg / pTotal * 100).toFixed(1) : 0, suggest,
  };
}
/** 写回单据（暂存/提交/审核时调用，台账读这些字段） */
function computeSummary(f) {
  Object.assign(f, summarize(f));
  if (f.status === 'draft' || f.status === 'returned') f.result = null;
  else if (!f.result) f.result = f.suggest;
  return f;
}
/** 提交前校验 */
function validateForm(f) {
  const errs = [], h = f.header;
  if (f.type === 'IQC') { if (!h.supplier) errs.push('请选择供应商'); if (!h.material) errs.push('请选择物料'); if (!h.qty) errs.push('请填写来料数量'); }
  if (f.type === 'IPQC') { if (!h.product) errs.push('请选择产品'); if (!h.order) errs.push('请填写订单号/货号'); if (!f.rounds.length) errs.push('至少完成 1 轮巡检'); }
  if (f.type === 'FQC') { if (!h.order) errs.push('请填写订单号'); if (!h.product) errs.push('请选择货号'); if (!h.qty) errs.push('请填写验货数量'); }
  if (f.plan && f.plan.method === '其他' && !f.plan.n) errs.push('「其他抽样计划」请填写抽样数量');
  (f.basePhotoDefs || []).forEach(d => { if ((f.basePhotos[d.key] || []).length < d.min) errs.push(`基础信息照片「${d.name}」至少需要 ${d.min} 张`); });
  if (f.roundPhoto) f.rounds.forEach((r, k) => { if ((r.photos || []).length < f.roundPhoto) errs.push(`第 ${k + 1} 轮（${r.time}）需要拍 ${f.roundPhoto} 张现场照片`); });
  const rule = photoRule(f), lackPhoto = [];
  f.items.forEach(it => {
    const v = f.values[it.id], r = itemResult(it, v), label = itemLabel(it);
    if (it.required) {
      if (it.type === 'measure' && !filled(v.value)) errs.push(`「${label}」未填写实测值`);
      if (it.type === 'judge' && !v.judge) errs.push(`「${label}」未判定`);
      if (it.type === 'table' && (v.rows || []).some(row => row.some(x => !filled(x)))) errs.push(`「${label}」表格未填完`);
      if (isPatrol(it)) f.rounds.forEach((rd, k) => { if (!cellFilled(it, v.cells[k])) errs.push(`第 ${k + 1} 轮（${rd.time}）「${label}」未填`); });
      if (it.type === 'number' && !filled(v.value)) errs.push(`「${label}」未填写`);
      if (it.type === 'sign' && !v.sign) errs.push(`「${label}」未签名`);
    }
    if (it.other && v.judge && !v.otherName) errs.push(`「${label}」请填写自填的检验项目和标准`);
    if (r === 'NG' && it.type === 'judge' && !v.note && !v.defect) errs.push(`「${label}」判 NG，请填写检查结果（不良描述）`);
    const need = photoNeed(it, v, rule);
    if (defectPhotoMissing(it, v)) errs.push(`「${label}」判不合格，必须拍一张不良部位的照片（不能用引用的照片）`);
    else if (need && (v.photos || []).length < need) lackPhoto.push(it.code || it.name);
  });
  if (lackPhoto.length) errs.push(`以下 ${lackPhoto.length} 个检验项还没拍照：${lackPhoto.join('、')}（可用「选本单已拍」引用同一张照片）`);
  if (f.type === 'IPQC' && f.items.some(it => itemResult(it, f.values[it.id]) === 'NG') && !f.problems.some(p => p.desc)) errs.push('有不良项，请在「存在的问题」里填写问题描述');
  return errs.slice(0, 30);
}
function nextNo(type, forms) {
  const d = ymdCompact(new Date());
  const prefix = `${type}-${d}-`;
  const max = forms.filter(f => f.no.startsWith(prefix)).reduce((m, f) => Math.max(m, Number(f.no.slice(-4))), 0);
  return prefix + pad(max + 1, 4);
}

/* ---------- 演示单据（近 30 天） ---------- */
const DEMO_READING = { B2: 78, B4: 3, C5: 150, D1: 45, D2: 72, D3: 60, D4: 70, D6: 2.5, D7: 15, D8: 75, D9: 3, D10: 70, D12: 200, D13: 150 };
const DEMO_PROBLEMS = [
  { code: 'D14', desc: 'D14 灯芯散头 2 PCS', cause: '灯芯剪切刀片磨损', action: '更换刀片，2 PCS 返工' },
  { code: 'D16', desc: 'D16 蜡身起泡 3 PCS', cause: '灌蜡温度偏低', action: '调整灌蜡温度，补蜡烤平' },
  { code: 'C8', desc: 'C8 灯芯偏位 2 PCS', cause: '粘芯治具松动', action: '紧固治具，重新粘芯' },
  { code: 'B3', desc: 'B3 蜡槽有杂质', cause: '未按时过滤', action: '立即过滤蜡槽，增加点检频次' },
  { code: 'D10', desc: 'D10 液面高度偏低', cause: '灌装计量泵偏差', action: '校准计量泵，偏低产品补蜡' },
  { code: 'D12', desc: 'D12 称重偏轻', cause: '灌蜡量不足', action: '调整灌装量，偏轻产品补蜡复称' },
];
function buildDemo(templates) {
  const forms = [], ncrs = [], logs = [];
  const today = new Date(); const seq = {};
  const inspectors = ['张伟', '阮氏梅', '黄磊'];
  const mk = (type, day) => {
    const key = type + ymdCompact(day); seq[key] = (seq[key] || 0) + 1;
    const f = newFormSkeleton(type, `${type}-${ymdCompact(day)}-${pad(seq[key], 4)}`, day);
    f.inspector = pick(inspectors); return f;
  };
  for (let back = 29; back >= 0; back--) {
    const day = new Date(today); day.setDate(today.getDate() - back);
    const plan = [];
    if (rnd() < 0.75) plan.push('IQC');
    if (rnd() < 0.35) plan.push('IQC');
    plan.push('IPQC');
    if (rnd() < 0.6) plan.push('FQC');
    plan.forEach((type, k) => {
      const f = mk(type, day), h = f.header;
      let bad = false;
      if (type === 'IQC') {
        const m = pick(MASTER.materials);
        Object.assign(h, { material: m.code, supplier: m.supplier, spec: m.spec, qty: pick([500, 1000, 1200, 2400, 3000, 5000]), receiveDate: ymd(day), order: `PO-${ymdCompact(day).slice(2)}${pad(k + 1)}`, lot: `L${ymdCompact(day).slice(2)}${pad(k + 1)}` });
        bad = rnd() < ({ S005: 0.35, S002: 0.2 }[m.supplier] || 0.06);
      } else if (type === 'IPQC') {
        const p = pick(MASTER.products);
        Object.assign(h, { product: p.code, spec: p.spec, order: `SO-26${pad(Math.floor(rnd() * 30) + 101, 3)}`, orderQty: pick([2400, 4800, 6000]), workshop: pick(MASTER.workshops), temp: 27 + Math.floor(rnd() * 6), humidity: 60 + Math.floor(rnd() * 20) });
        const n = back === 0 ? 2 : 6;
        for (let i = 0; i < n; i++) {
          const time = `${pad(8 + i * 2)}:00`;
          f.rounds.push({ time, by: f.inspector, qty: 10, photos: [{ id: uid(), ph: `第${i + 1}轮巡检 ${time}`, hue: 40, time: `${ymd(day)} ${time}`, by: f.inspector }] });
        }
        bad = rnd() < 0.18;
      } else {
        const p = pick(MASTER.products);
        const oq = pick([1200, 2400, 4800]);
        Object.assign(h, { product: p.code, spec: p.spec, customer: p.customer, orderQty: oq, qty: oq, size: sizeText(p), visit: rnd() < 0.15 ? '复验' : '首次', order: `SO-26${pad(Math.floor(rnd() * 30) + 101, 3)}` });
        bad = rnd() < 0.08;
      }
      applyTemplate(f, templates);
      recalcPlan(f);
      fillDemoValues(f, bad);
      if (back === 0 && (type === 'IPQC' || k === 0)) f.status = 'draft';
      else if (back <= 1) f.status = 'submitted';
      else if (back === 4 && type === 'FQC') { f.status = 'returned'; f.reviewComment = 'A1 唛头照片不清晰，请重拍'; f.reviewer = '李娜'; }
      else { f.status = 'approved'; f.reviewer = '李娜'; f.reviewedAt = nowStr(day); }
      if (f.status !== 'draft') f.submittedAt = nowStr(day);
      computeSummary(f);
      forms.push(f);
      if (f.status !== 'draft') logs.push({ time: nowStr(day), user: f.inspector, action: '提交', target: f.no, detail: `判定 ${f.result}` });
      if (f.status === 'approved') logs.push({ time: nowStr(day), user: '李娜', action: '审核通过', target: f.no, detail: '' });
      if (f.status === 'approved' && f.result === 'NG') {
        const closed = back > 7;
        const n = {
          no: `NCR-${ymdCompact(day)}-${pad(ncrs.length + 1, 3)}`, formNo: f.no, type, createdAt: ymd(day),
          desc: f.mainDefect || '检验不合格',
          disposition: closed ? pick(DISPOSITIONS[type].slice(0, 3)) : '',
          owner: type === 'IQC' ? supplierName(h.supplier) : (h.workshop || '生产部'),
          action: closed ? '责任方已提交改善报告，后续 3 批加严检验' : '',
          confirmer: closed ? '王强' : '', status: closed ? '已关闭' : (rnd() < 0.5 ? '处理中' : '待处置'),
          closedAt: closed ? ymd(new Date(day.getTime() + 3 * 864e5)) : '',
        };
        ncrs.push(n); f.ncrNo = n.no; f.ncrResult = n.disposition;
      }
    });
  }
  return { forms: forms.reverse(), ncrs: ncrs.reverse(), logs: logs.reverse() };
}
function fillDemoValues(f, bad) {
  const t = `${f.date} ${pad(9 + Math.floor(rnd() * 7))}:${pad(Math.floor(rnd() * 60))}`;
  const ph = (label, hue) => ({ id: uid(), ph: label, hue, time: t, by: f.inspector });
  const photo = (it, hue) => hue === 210 ? ph(itemLabel(it), hue) : { ...ph('不良 · ' + itemLabel(it), hue), defect: true };
  // 基础信息照片
  (f.basePhotoDefs || []).forEach(d => { f.basePhotos[d.key] = Array.from({ length: d.min }, (_, i) => ph(d.name + (d.min > 1 ? ` ${i + 1}` : ''), 160)); });
  f.items.forEach(it => {
    const v = f.values[it.id];
    if (it.type === 'judge' && !it.other) v.judge = 'OK';
    if (it.type === 'table') v.rows = Array.from({ length: it.samples }, () => it.dims.map(d => { const span = filled(d.pct) ? d.std * d.pct / 100 : (d.hi - d.lo) / 2; return +(d.std + (rnd() - 0.5) * span).toFixed(d.std >= 100 ? 1 : 2); }));
    if (isPatrol(it)) v.cells = f.rounds.map(() => it.type === 'check' ? { v: 'OK', ng: false } : { v: +(((filled(it.std) ? it.std : DEMO_READING[it.code]) || 10) * (1 + (rnd() - 0.5) * 0.04)).toFixed(1), ng: false });
  });
  // 单芯产品 D2 选 NA，双芯产品 D1 选 NA
  const p = MASTER.products.find(x => x.code === f.header.product);
  if (f.type === 'FQC' && p) { const na = p.wick > 1 ? 'fD1' : 'fD2'; if (f.values[na]) f.values[na].judge = 'NA'; }
  linkCoverPhotos(f);
  // 每项照片（合格也拍）；清单照片没覆盖到的项目单独拍
  const rule = photoRule(f); const shared = {};
  f.items.forEach(it => {
    const v = f.values[it.id];
    if (photoNeed(it, v, rule) && !v.photos.length) {
      const share = ['A', 'B'].includes((it.code || '')[0]) && f.type === 'FQC';
      if (share) { shared[it.group] = shared[it.group] || ph(it.group, 210); v.photos = [{ ...shared[it.group], id: uid() }]; }
      else v.photos = [photo(it, 210)];
    }
  });
  if (f.type === 'IPQC') {
    if (bad) {
      const pr = pick(DEMO_PROBLEMS); const it = f.items.find(i => i.code === pr.code) || f.items.find(i => i.type === 'check');
      const v = f.values[it.id]; const k = Math.floor(rnd() * f.rounds.length);
      if (it.type === 'check') v.cells[k].v = 'NG'; else if (filled(it.lo)) v.cells[k].v = +(it.lo * 0.97).toFixed(1); else v.cells[k].ng = true;
      v.photos = [photo(it, 0)];
      f.problems.push({ time: f.rounds[k].time, desc: pr.desc, cause: pr.cause, action: pr.action });
    }
    return;
  }
  const judges = f.items.filter(i => i.type === 'judge');
  if (bad) {
    const cands = judges.filter(i => !i.other && i.level !== 'MIN' && f.values[i.id].judge !== 'NA');
    const it = pick(cands); const v = f.values[it.id];
    const lvl = f.plan && f.plan.levels[it.level];
    v.judge = 'NG'; v.level = it.level;
    v.qty = it.sampling === 'fixed' ? 2 : (it.level === 'CR' ? 1 : ((lvl && lvl.re) || 2) + Math.floor(rnd() * 2));
    v.note = `抽检发现 ${v.qty} PCS 不良`;
    v.photos = [...v.photos, photo(it, 0)];
  } else if (rnd() < 0.3) {
    // 有轻微缺陷但未超接收数：批次仍合格
    const minors = judges.filter(i => !i.other && (i.level === 'MIN' || (i.level === 'MAJ' && i.sampling !== 'fixed')));
    if (minors.length) {
      const it = pick(minors), v = f.values[it.id], lvl = f.plan && f.plan.levels[it.level];
      if (lvl && lvl.ac >= 1) { v.judge = 'NG'; v.level = it.level; v.qty = 1; v.note = '抽检发现 1 PCS 轻微不良'; v.photos = [...v.photos, photo(it, 30)]; }
    }
  }
}


/* ---------- 异常：发现即上报、限时处理 ---------- */
const ANOMALY_ACTIONS = {
  IQC: ['隔离待处理', '通知供应商', '退货', '挑选使用', '特采'],
  IPQC: ['停线整改', '调整工艺参数', '隔离返工', '加严巡检后继续生产'],
  FQC: ['隔离待判', '返工', '挑选', '特采放行'],
};
/** 从单据里找出所有异常：判 NG、实测超差、巡检 ✗ 或读数超限。每条有固定 key，用来跟踪处理状态 */
function anomaliesOf(f) {
  const out = [];
  const photoOf = v => (v.photos || []).find(isDefectPhoto) || (v.photos || [])[0] || null;
  f.items.forEach(it => {
    const v = f.values[it.id]; if (!v) return;
    const base = { no: f.no, type: f.type, itemId: it.id, code: it.code, item: itemLabel(it) + (v.otherName ? '：' + v.otherName : ''), level: v.level || it.level || 'MAJ', photo: photoOf(v) };
    if (it.type === 'judge' && v.judge === 'NG') out.push({ ...base, key: `${f.no}|${it.id}|j`, detail: `NG ×${Math.max(1, Number(v.qty) || 1)}${v.note ? '：' + v.note : ''}`, std: it.remark || '—' });
    if (it.type === 'measure' && measureState(it, v.value) === 'NG') out.push({ ...base, key: `${f.no}|${it.id}|m`, detail: `实测 ${v.value} ${it.unit}`, std: `${it.std}（${it.lo}~${it.hi}）` });
    if (it.type === 'table') (v.rows || []).forEach((row, i) => row.forEach((x, j) => {
      const d = it.dims[j];
      if (dimNG(d, x)) out.push({ ...base, key: `${f.no}|${it.id}|s${i}d${j}`, detail: `样本 ${i + 1} ${d.name} 实测 ${x}`, std: `${d.std}（${d.lo}~${d.hi}）` });
    }));
    if (isPatrol(it)) (v.cells || []).forEach((c, k) => {
      if (!cellNG(it, c) || !f.rounds[k]) return;
      out.push({ ...base, key: `${f.no}|${it.id}|r${k}`, round: f.rounds[k].time,
        detail: it.type === 'check' ? `第 ${k + 1} 轮 ${f.rounds[k].time} 判 ✗` : `第 ${k + 1} 轮 ${f.rounds[k].time} 读数 ${c.v} ${it.unit}`,
        std: filled(it.lo) ? `${it.std}（${it.lo}~${it.hi}）${it.unit}` : '—' });
    });
  });
  return out;
}
function anomalyHours(level) { return (store.settings.anomalyHours || {})[level] || 2; }
/** 单据上出现新异常时立即登记（已登记的保持不动）；还没人处理就被改回合格的，撤销登记 */
function syncAnomalies(f, who) {
  const list = anomaliesOf(f), keys = new Set(list.map(a => a.key)), added = [];
  list.forEach(a => {
    if (store.anomalyStatus[a.key]) return;
    const now = Date.now();
    store.anomalyStatus[a.key] = { status: '待处理', reportedAt: now, deadline: now + anomalyHours(a.level) * 3600e3, reporter: who || f.inspector, handler: '', disposition: '', action: '', closedAt: null };
    added.push(a);
  });
  Object.keys(store.anomalyStatus).forEach(k => {
    if (k.startsWith(f.no + '|') && !keys.has(k) && store.anomalyStatus[k].status === '待处理') delete store.anomalyStatus[k];
  });
  return added;
}
function anomalyState(st, now = Date.now()) {
  if (!st) return { label: '待处理', overdue: false };
  if (st.status === '已关闭') return { label: '已关闭', overdue: st.closedAt > st.deadline };
  return { label: st.status, overdue: now > st.deadline };
}
/** 演示数据：历史异常已处理关闭，最近两天的部分还在处理 */
function demoAnomalyStatus(forms) {
  const map = {}; const today = ymd(new Date());
  const yest = ymd(new Date(Date.now() - 864e5));
  forms.forEach(f => anomaliesOf(f).forEach((a, i) => {
    const base = new Date(f.date + 'T' + (a.round || '10:00') + ':00').getTime() + i * 60e3;
    const hours = { CR: 1, MAJ: 2, MIN: 4 }[a.level] || 2;
    const st = { status: '已关闭', reportedAt: base, deadline: base + hours * 3600e3, reporter: f.inspector, handler: '李娜', disposition: pick(ANOMALY_ACTIONS[f.type]), action: '', closedAt: base + (20 + Math.floor(rnd() * 90)) * 60e3 };
    const pr = DEMO_PROBLEMS.find(p => p.code === a.code);
    st.action = pr ? `${pr.cause}；${pr.action}` : (f.type === 'IQC' ? '已隔离该批，通知供应商提交改善报告' : '已隔离不良品并返工，复检合格');
    if (f.date === today) Object.assign(st, { status: '待处理', handler: '', disposition: '', action: '', closedAt: null, reportedAt: Date.now() - 25 * 60e3, deadline: Date.now() - 25 * 60e3 + hours * 3600e3 });
    else if (f.date === yest) Object.assign(st, i % 2 ? { status: '待处理', handler: '', disposition: '', action: '', closedAt: null } : { status: '处理中', action: '', closedAt: null });
    map[a.key] = st;
  }));
  return map;
}

/* ---------- 全局 store（本地持久化） ---------- */
const STORE_KEY = 'qc-proto-v8';
function freshState() {
  _seed = 20261123;
  const templates = clone(DEFAULT_TEMPLATES);
  const demo = buildDemo(templates);
  return { templates, ...demo, anomalyStatus: demoAnomalyStatus(demo.forms) };
}
function loadState() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return JSON.parse(raw); } catch (e) { /* 读不到就用演示数据 */ }
  return freshState();
}
const store = reactive({
  role: (() => { try { return localStorage.getItem('qc-proto-role') || 'inspector'; } catch (e) { return 'inspector'; } })(),
  factory: '示例工厂（越南）',
  lang: 'zh',
  showVi: (() => { try { return localStorage.getItem('qc-proto-vi') !== '0'; } catch (e) { return true; } })(),
  settings: { warnRate: 90, warnConsecutive: 2, photoMaxKB: 800, keepYears: 3, allowAlbum: true, anomalyHours: { CR: 1, MAJ: 2, MIN: 4 } },
  ...loadState(),
});
let _saveWarned = false;
watch(() => [store.forms, store.templates, store.ncrs, store.logs, store.anomalyStatus], () => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ forms: store.forms, templates: store.templates, ncrs: store.ncrs, logs: store.logs, anomalyStatus: store.anomalyStatus })); }
  catch (e) { if (!_saveWarned) { _saveWarned = true; console.warn('本地存储已满，新拍照片仅本次会话保留'); } }
}, { deep: true });
watch(() => store.role, r => { try { localStorage.setItem('qc-proto-role', r); } catch (e) { } });
watch(() => store.showVi, v => { try { localStorage.setItem('qc-proto-vi', v ? '1' : '0'); } catch (e) { } });

function addLog(action, target, detail = '') { store.logs.unshift({ time: nowStr(), user: ROLES[store.role].user, action, target, detail }); }
function resetDemo() { Object.assign(store, freshState()); }
