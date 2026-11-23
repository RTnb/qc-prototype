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
const SAMPLING_METHODS = ['MIL-STD-105E II', '全检', '其他'];
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
function lotLetter(lotSize) { return LOT_RANGES.find(r => lotSize >= r[0] && lotSize <= r[1]); }
function aqlPlan(lotSize, aql) {
  lotSize = Number(lotSize) || 0;
  if (lotSize < 2) return null;
  let li = LOT_RANGES.findIndex(r => lotSize >= r[0] && lotSize <= r[1]);
  const ai = AQL_LEVELS.indexOf(Number(aql)) - AQL_LEVELS.indexOf(0.65);
  if (li < 0 || ai < -5) return null;
  for (let guard = 0; guard < 30; guard++) {
    const d = li + ai;
    if (ACRE_BY_D[d]) { const [, , code, n] = LOT_RANGES[li]; return { code, n: Math.min(n, lotSize), ac: ACRE_BY_D[d][0], re: ACRE_BY_D[d][1] }; }
    if (d < 5 || d === 7) li++; else li--;
    if (li < 0 || li >= LOT_RANGES.length) return null;
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
    { code: 'M-WX-01', name: '大豆蜡', vi: 'Sáp đậu nành', spec: '464 片状 20kg/箱', unit: 'KG', supplier: 'S003', dims: {} },
    { code: 'M-WK-01', name: '棉芯灯芯', vi: 'Tim đèn cotton', spec: 'CD-10 带底座 150mm', unit: 'PCS', supplier: 'S004', dims: {} },
    { code: 'M-PK-01', name: '彩盒', vi: 'Hộp màu', spec: '8oz 四色印刷', unit: 'PCS', supplier: 'S005', dims: {} },
    { code: 'M-PK-02', name: '外箱', vi: 'Thùng carton', spec: '五层瓦楞 12 入', unit: 'PCS', supplier: 'S005', dims: {} },
  ],
  products: [
    { code: 'P-01', name: '香薰杯蜡 8oz（透明杯·薰衣草）', spec: 'SC-8-LV 单芯 净重 200g', customer: 'C01', wick: 1 },
    { code: 'P-02', name: '香薰杯蜡 12oz（磨砂杯·香草）', spec: 'SC-12-VN 双芯 净重 320g', customer: 'C02', wick: 2 },
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

const TPL_IQC_GLASS = {
  id: 'TPL-IQC-001', docNo: 'SL/QR-35', name: '进料检验报告（玻璃杯-透明）', nameVi: 'Báo cáo kiểm tra nguyên liệu đầu vào', type: 'IQC',
  version: 1, status: '已发布', updatedAt: '2026-11-06', bind: { materials: ['M-GL-01', 'M-GL-02'], processes: [] }, ngPhoto: true,
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
  plan: { method: 'MIL-STD-105E II', aql: { CR: 0, MAJ: 2.5, MIN: 2.5 }, fixed: { n: 5, ac: { CR: 0, MAJ: 1, MIN: 1 } } },
  note: '规格和性能检验按照 5PCS 每批次进行抽样，判定标准是：CR: 0 PCS；MAJ ≤ 1 PCS；MIN ≤ 1 PCS', noteVi: '',
  items: [
    I('规格型号与订单/样品一致', 'judge', { id: 'g1', code: '1.1', ...G('1', '规格（5PCS）', 'Quy cách (5PCS)'), vi: 'Quy cách đúng với đơn hàng / mẫu', level: 'MAJ', sampling: 'fixed' }),
    I('外观无破损、污渍、异物', 'judge', { id: 'g2', code: '2.1', ...G('2', '外观', 'Ngoại quan'), vi: 'Ngoại quan không hư hỏng, bẩn, dị vật', level: 'MAJ', mustPhoto: true }),
    I('包装标识正确', 'judge', { id: 'g3', code: '2.2', ...G('2', '外观', 'Ngoại quan'), vi: 'Nhãn mác bao bì chính xác', level: 'MIN' }),
    I('性能符合订单要求', 'judge', { id: 'g4', code: '3.1', ...G('3', '性能（5PCS）', 'Tính năng (5PCS)'), vi: 'Tính năng đáp ứng yêu cầu đơn hàng', level: 'MAJ', sampling: 'fixed' }),
  ],
};
function patrolItems() {
  const B = G('', '蘸灯芯', 'Nhúng tim đèn'), C = G('', '压制蜡柱', 'Sáp trụ ép chế'), D = G('', '灌装', 'Chế sáp');
  const c = (code, lv, name, vi, grp, o = {}) => I(name, 'check', { id: 'p' + code, code, level: lv, vi, ...grp, ...o });
  const r = (code, lv, name, vi, unit, grp) => I(name, 'reading', { id: 'p' + code, code, level: lv, vi, unit, lo: null, hi: null, ...grp });
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
    r('D10', 'MAJ', '最终产品液面高度', 'Độ cao mặt sáp lỏng', 'mm', D),
    c('D11', 'MIN', '剖体', 'Xẻ thân', D),
    r('D12', 'MIN', '称重', 'Lượng cân', 'g', D),
    r('D13', 'MIN', '灯芯长度', 'Độ dài tim đèn', 'mm', D),
    c('D14', 'MAJ', '灯芯是否有散头', 'Đầu tim đèn có bị tua không', D),
    c('D15', 'MAJ', '蜡是否有掉蜡块现象', 'Sáp có hiện tượng rớt sáp miếng không', D),
    c('D16', 'MAJ', '蜡身起泡', 'Thân nến nổi bong bóng', D),
  ];
}
const TPL_IPQC = {
  id: 'TPL-IPQC-001', docNo: 'SL/QR-36-02', name: '杯蜡在线巡检稽查表', nameVi: 'Bảng kiểm tra tuần kiểm sáp ly trên chuyền', type: 'IPQC',
  version: 1, status: '已发布', updatedAt: '2026-11-03', bind: { materials: [], processes: [] }, isDefault: true, ngPhoto: true,
  patrol: { rounds: 6, perRound: 10, intervalH: 2 },
  note: '每 2 小时巡检 1 次；每次抽查 10 PCS', noteVi: 'Mỗi 2 giờ tuần kiểm 1 lần, mỗi lần rút kiểm 10 cái',
  items: patrolItems(),
};
function fqcItems() {
  const j = (code, lv, name, vi, grp, o = {}) => I(name, 'judge', { id: 'f' + code, code, level: lv, vi, ...grp, ...o });
  const A = G('A', '外箱', 'Thùng carton'), B = G('B', '产品包装（参考黄金样）', 'Đóng gói sản phẩm (Tham khảo bản mẫu của khách hàng)');
  const C = G('C', '外观', 'Kiểm tra bên ngoài'), D = G('D', '灯芯位置', 'Vị trí tim đèn');
  const E = G('', '订单要求核对', 'Yêu cầu đơn hàng'), L = G('L', '产品内部测试', 'Thử nghiệm nội bộ sản phẩm');
  return [
    j('A1', 'CR', '错误的唛头印刷', 'Sai tem thùng', A, { mustPhoto: true }),
    j('A2', 'MAJ', '箱子毁损', 'Thùng bị hư hỏng', A),
    j('A3', 'CR', '错误的装箱数', 'Số lượng đóng gói bị sai', A),
    j('A4', 'MAJ', '错误的入箱方向/错误的装箱方式', 'Để sai hướng đóng gói / Phương pháp đóng gói sai', A),
    j('A5', 'CR', '条码不能被验证', 'Mã UPC không được xác nhận', A),
    j('A6', 'CR', '摔箱测试失败', 'Thử nghiệm thả hộp không đạt', A),
    j('B1', 'MAJ', '盒子损坏', 'Hộp bị hư', B),
    j('B2', 'MAJ', '盒子不能平放', 'Hộp để không vững', B),
    j('B3', 'MIN', '日期标和箱唛不一致', 'Tem ngày tháng không khớp với thùng', B),
    j('B4', 'CR', '内有异物', 'Dị vật bên trong', B),
    j('B5', 'CR', '图样不符合留样', 'Hình mẫu không khớp với bản mẫu của khách hàng', B),
    j('B6', 'CR', '条码不能被验证', 'Mã UPC không được xác nhận', B),
    j('B7', 'MAJ', '错误的产品入盒方向', 'Để sai hướng đóng gói', B),
    j('C1', 'MAJ', '蜡身没有裂纹', 'Thân sáp cầy có vết nứt không', C),
    j('C2', 'MAJ', '干净', 'Sạch sẽ', C),
    j('C3', 'MIN', '没有粘壁', 'Có vết dính không', C),
    j('C4', 'MAJ', '蜡表面光滑', 'Mặt sáp có mịn không', C),
    j('C5', 'MAJ', '蜡身不起花', 'Thân sáp không nổi hoa tuyết', C),
    j('C6', 'MAJ', '蜡身起泡', 'Thân nến nổi bong bóng', C),
    j('C7', 'CR', '标签条码正确性（尺寸是否符合要求；是否在检验后使用）', 'Tính chính xác của tem mã vạch (kích thước có phù hợp yêu cầu không; có phải sử dụng sau khi kiểm nghiệm không)', C),
    j('C8', 'MAJ', '标签条码位置', 'Vị trí tem mã vạch', C),
    j('D1', 'MAJ', '一个灯芯居中', 'Trung tâm 1 tim đèn', D, { remark: '单芯产品适用，多芯选 NA' }),
    j('D2', 'MAJ', '多灯芯均匀分布', 'Phân bố đồng đều nhiều tim đèn', D, { remark: '多芯产品适用，单芯选 NA' }),
    j('E1', 'CR', '灯芯型号符合订单要求', 'Mô hình tim đèn đáp ứng yêu cầu đặt hàng', E),
    j('F1', 'CR', '（容器）尺寸符合订单要求', 'Kích thước dung môi đáp ứng yêu cầu đặt hàng', E),
    j('G1', 'CR', '（容器）效果符合订单要求', 'Hiệu ứng dung môi đáp ứng yêu cầu đặt hàng', E),
    j('G2', 'CR', '（容器）外观无损坏', 'Dung môi không ảnh hưởng về ngoại hình', E),
    j('H1', 'CR', '产品颜色符合订单要求', 'Màu sắc sản phẩm đáp ứng yêu cầu đặt hàng', E),
    j('I1', 'CR', '产品香味符合订单要求', 'Mùi hương sản phẩm đáp ứng yêu cầu đặt hàng', E),
    j('J1', 'CR', '液面高度符合订单要求', 'Độ cao mặt sáp đáp ứng yêu cầu đặt hàng', E),
    j('K1', 'CR', '产品重量符合订单要求', 'Trọng lượng sản phẩm đáp ứng yêu cầu đặt hàng', E),
    j('L1', 'CR', '燃烧测试符合产品标准', 'Thử nghiệm đốt cháy đạt tiêu chuẩn sản phẩm', L),
    j('L2', 'CR', '变色测试符合产品标准', 'Thử nghiệm đổi màu đạt tiêu chuẩn sản phẩm', L),
    j('L3', 'CR', '高温测试符合产品标准', 'Thử nghiệm nhiệt độ cao đạt tiêu chuẩn sản phẩm', L),
    j('L4', 'CR', '低温测试符合产品标准', 'Thử nghiệm nhiệt độ thấp đạt tiêu chuẩn sản phẩm', L),
    j('L5', 'CR', '黑烟测试符合产品标准', 'Thử nghiệm khói đạt tiêu chuẩn sản phẩm', L),
  ];
}
const TPL_FQC = {
  id: 'TPL-FQC-001', docNo: 'SL/QR-38', name: '成品检验报告', nameVi: 'Báo cáo kiểm nghiệm thành phẩm', type: 'FQC',
  version: 1, status: '已发布', updatedAt: '2026-11-03', bind: { materials: [], processes: [] }, isDefault: true, ngPhoto: true,
  plan: { method: 'MIL-STD-105E II', aql: { CR: 0, MAJ: 2.5, MIN: 4.0 } },
  note: '纸质表上 MAJ / MIN 的 AQL 为空白，原型暂按 MAJ 2.5、MIN 4.0，可在模版中修改', noteVi: '',
  items: fqcItems(),
};
const DEFAULT_TEMPLATES = [TPL_IQC_GLASS, TPL_IQC_GENERAL, TPL_IPQC, TPL_FQC];

/* ---------- 单据核心逻辑 ---------- */
function supplierName(code) { return (MASTER.suppliers.find(s => s.code === code) || {}).name || ''; }
function materialOf(code) { return MASTER.materials.find(s => s.code === code) || MASTER.products.find(s => s.code === code); }
function materialName(code) { return (materialOf(code) || {}).name || ''; }
function customerName(code) { return (MASTER.customers.find(s => s.code === code) || {}).name || ''; }
function defectName(code) { const d = MASTER.defects.find(x => x.code === code); return d ? `${d.code} ${d.name}` : ''; }
function itemLabel(it) { return (it.code ? it.code + ' ' : '') + it.name; }

function newFormSkeleton(type, no, date = new Date()) {
  return {
    no, type, date: ymd(date), status: 'draft', result: null, suggest: null,
    header: {
      supplier: '', material: '', spec: '', qty: null, receiveDate: ymd(date), order: '', lot: '',
      customer: '', product: '', method: 'MIL-STD-105E II', customN: null,
      workshop: '', orderQty: null, temp: null, humidity: null, page: 1, remark: '',
    },
    tplId: '', tplVersion: null, tplName: '', docNo: '', tplPlan: null, tplPatrol: null, tplNote: '', tplNoteVi: '', ngPhoto: true,
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
    value: null, judge: '', qty: null, note: '', defect: '', photos: [], sign: '',
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
}
/** 抽样方案：按 CR / MAJ / MIN 各自的 AQL 算接收/拒收数 */
function recalcPlan(f) {
  if (f.type === 'IPQC' || !f.tplPlan) { f.plan = null; return; }
  const tp = f.tplPlan, h = f.header, qty = Number(h.qty) || 0;
  const method = h.method || tp.method;
  const prev = f.plan;
  let n = null, code = '', levels = {};
  if (method === 'MIL-STD-105E II') {
    const r = qty >= 2 ? lotLetter(qty) : null;
    if (r) { code = r[2]; n = Math.min(r[3], qty); }
    LEVEL_KEYS.forEach(L => {
      const a = tp.aql[L];
      if (a === 0) levels[L] = { aql: 0, ac: 0, re: 1 };
      else { const p = aqlPlan(qty, a); levels[L] = p ? { aql: a, ac: p.ac, re: p.re } : { aql: a, ac: null, re: null }; }
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
/** 纯计算，不改单据（页面实时显示用） */
function summarize(f) {
  const lv = { aql: { CR: 0, MAJ: 0, MIN: 0 }, fixed: { CR: 0, MAJ: 0, MIN: 0 } };
  let ngItems = 0, photos = 0, pTotal = 0, pNg = 0; const names = [];
  f.items.forEach(it => {
    const v = f.values[it.id];
    photos += (v.photos || []).length;
    if (isPatrol(it)) (v.cells || []).slice(0, f.rounds.length).forEach(c => { if (cellFilled(it, c)) pTotal++; if (cellNG(it, c)) pNg++; });
    if (itemResult(it, v) === 'NG') {
      ngItems++; names.push(itemLabel(it));
      lv[it.sampling === 'fixed' ? 'fixed' : 'aql'][it.level || 'MAJ'] += itemQty(it, v);
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
  if (f.type === 'FQC') { if (!h.customer) errs.push('请选择客户'); if (!h.product) errs.push('请选择产品'); if (!h.qty) errs.push('请填写生产数量'); if (!h.order) errs.push('请填写订单号'); }
  if (f.plan && f.plan.method === '其他' && !f.plan.n) errs.push('「其他抽样计划」请填写抽样数量');
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
    if (r === 'NG' && it.type === 'judge' && !v.note && !v.defect) errs.push(`「${label}」判 NG，请填写检查结果（不良描述）`);
    let need = it.type === 'photo' ? (it.minPhotos || 1) : (it.mustPhoto ? (it.minPhotos || 1) : 0);
    if (r === 'NG' && f.ngPhoto) need = Math.max(need, 1);
    if (need && (v.photos || []).length < need) errs.push(`「${label}」${r === 'NG' ? '判 NG，' : ''}至少需要 ${need} 张照片`);
  });
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
        for (let i = 0; i < n; i++) f.rounds.push({ time: `${pad(8 + i * 2)}:00`, by: f.inspector, qty: 10 });
        bad = rnd() < 0.18;
      } else {
        const p = pick(MASTER.products);
        Object.assign(h, { product: p.code, spec: p.spec, customer: p.customer, qty: pick([1200, 2400, 4800]), order: `SO-26${pad(Math.floor(rnd() * 30) + 101, 3)}` });
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
  const photo = (it, hue) => ({ id: uid(), src: placeholderPhoto(itemLabel(it), hue), time: nowStr(new Date(f.date)), by: f.inspector, sample: 1 });
  f.items.forEach(it => {
    const v = f.values[it.id];
    if (it.type === 'judge') v.judge = 'OK';
    if (it.type === 'table') v.rows = Array.from({ length: it.samples }, () => it.dims.map(d => +(d.std * (1 + (rnd() - 0.5) * d.pct / 100)).toFixed(d.std >= 100 ? 1 : 2)));
    if (isPatrol(it)) v.cells = f.rounds.map(() => it.type === 'check' ? { v: 'OK', ng: false } : { v: +((DEMO_READING[it.code] || 10) * (1 + (rnd() - 0.5) * 0.04)).toFixed(1), ng: false });
    if (it.mustPhoto) v.photos = [photo(it, 210)];
  });
  // 单芯产品 D2 选 NA，双芯产品 D1 选 NA
  const p = MASTER.products.find(x => x.code === f.header.product);
  if (f.type === 'FQC' && p) { const na = p.wick > 1 ? 'fD1' : 'fD2'; if (f.values[na]) f.values[na].judge = 'NA'; }
  if (f.type === 'IPQC') {
    if (bad) {
      const pr = pick(DEMO_PROBLEMS); const it = f.items.find(i => i.code === pr.code) || f.items.find(i => i.type === 'check');
      const v = f.values[it.id]; const k = Math.floor(rnd() * f.rounds.length);
      if (it.type === 'check') v.cells[k].v = 'NG'; else v.cells[k].ng = true;
      v.photos = [photo(it, 0)];
      f.problems.push({ time: f.rounds[k].time, desc: pr.desc, cause: pr.cause, action: pr.action });
    }
    return;
  }
  const judges = f.items.filter(i => i.type === 'judge');
  if (bad) {
    const cands = judges.filter(i => i.level !== 'MIN' && f.values[i.id].judge !== 'NA');
    const it = pick(cands); const v = f.values[it.id];
    const lvl = f.plan && f.plan.levels[it.level];
    v.judge = 'NG';
    v.qty = it.sampling === 'fixed' ? 2 : (it.level === 'CR' ? 1 : ((lvl && lvl.re) || 2) + Math.floor(rnd() * 2));
    v.note = `抽检发现 ${v.qty} PCS 不良`;
    v.photos = [...v.photos, photo(it, 0)];
  } else if (rnd() < 0.3) {
    // 有轻微缺陷但未超接收数：批次仍合格
    const minors = judges.filter(i => i.level === 'MIN' || (i.level === 'MAJ' && i.sampling !== 'fixed'));
    if (minors.length) {
      const it = pick(minors), v = f.values[it.id], lvl = f.plan && f.plan.levels[it.level];
      if (lvl && lvl.ac >= 1) { v.judge = 'NG'; v.qty = 1; v.note = '抽检发现 1 PCS 轻微不良'; v.photos = [...v.photos, photo(it, 30)]; }
    }
  }
}

/* ---------- 全局 store（本地持久化） ---------- */
const STORE_KEY = 'qc-proto-v2';
function freshState() {
  _seed = 20261123;
  const templates = clone(DEFAULT_TEMPLATES);
  return { templates, ...buildDemo(templates) };
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
  settings: { warnRate: 90, warnConsecutive: 2, photoMaxKB: 800, keepYears: 3, allowAlbum: true },
  ...loadState(),
});
let _saveWarned = false;
watch(() => [store.forms, store.templates, store.ncrs, store.logs], () => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ forms: store.forms, templates: store.templates, ncrs: store.ncrs, logs: store.logs })); }
  catch (e) { if (!_saveWarned) { _saveWarned = true; console.warn('本地存储已满，新拍照片仅本次会话保留'); } }
}, { deep: true });
watch(() => store.role, r => { try { localStorage.setItem('qc-proto-role', r); } catch (e) { } });
watch(() => store.showVi, v => { try { localStorage.setItem('qc-proto-vi', v ? '1' : '0'); } catch (e) { } });

function addLog(action, target, detail = '') { store.logs.unshift({ time: nowStr(), user: ROLES[store.role].user, action, target, detail }); }
function resetDemo() { Object.assign(store, freshState()); }
