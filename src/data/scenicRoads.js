/**
 * 한국 주요 해안/산악 경관 구간 데이터베이스
 *
 * 도로 전체가 아닌 "경관이 뛰어난 특정 구간" 단위로 정의.
 * 감지 알고리즘은 경로 폴리라인의 각 점에서 segmentMid까지의 거리로 판단.
 *
 * scenicType  : 'coastal' | 'mountain'
 * segmentStart/End : [lat, lng] — 구간 시작·끝 대표 좌표
 * segmentMid  : [lat, lng] — 구간 중간 대표 좌표 (감지 기준)
 * nearKm      : 경로의 어느 점이 이 거리 내에 있으면 "근처"로 판단
 * detourKm/Minutes : 직행 경로 대비 이 구간을 들르기 위한 추가 거리/시간
 * viaPoints   : 경유지로 제안할 핵심 좌표 목록
 * stars       : 경관 등급 1~5 (안내 우선순위)
 */
export const SCENIC_SEGMENTS = [

  // ══════════════════════════════════════════════
  //  🌊  해안도로 구간
  // ══════════════════════════════════════════════

  // ── 동해안 (국도 7호선) ────────────────────────
  {
    id: 'r7-pohang-youngdeok',
    roadNumber: '7', roadType: 'national',
    scenicType: 'coastal', stars: 3,
    name: '동해안 포항~영덕',
    roadLabel: '국도 7호선 포항~영덕',
    emoji: '🌊',
    description: '구룡포와 강구항을 잇는 동해안. 대게 산지로 유명한 영덕 해안이 펼쳐진다.',
    segmentStart: [36.02, 129.34], segmentEnd: [36.41, 129.37], segmentMid: [36.22, 129.36],
    nearKm: 35, detourKm: 30, detourMinutes: 25,
    viaPoints: [{ lat: 36.02, lng: 129.34, name: '포항 구룡포' }, { lat: 36.41, lng: 129.37, name: '영덕 강구항' }],
  },
  {
    id: 'r7-youngdeok-uljin',
    roadNumber: '7', roadType: 'national',
    scenicType: 'coastal', stars: 4,
    name: '동해안 영덕~울진',
    roadLabel: '국도 7호선 영덕~울진',
    emoji: '🌊',
    description: '동해의 푸른 바다가 도로 옆으로 바짝 붙는 구간. 고래불해수욕장과 후포항이 이어진다.',
    segmentStart: [36.41, 129.37], segmentEnd: [36.99, 129.40], segmentMid: [36.70, 129.39],
    nearKm: 40, detourKm: 40, detourMinutes: 35,
    viaPoints: [{ lat: 36.41, lng: 129.37, name: '영덕' }, { lat: 36.99, lng: 129.40, name: '울진' }],
  },
  {
    id: 'r7-uljin-samcheok',
    roadNumber: '7', roadType: 'national',
    scenicType: 'coastal', stars: 4,
    name: '동해안 울진~삼척',
    roadLabel: '국도 7호선 울진~삼척',
    emoji: '🌊',
    description: '덕구온천과 죽변항을 지나 삼척까지 이어지는 원시 해안. 해식절벽과 조개더미 해안이 장관이다.',
    segmentStart: [36.99, 129.40], segmentEnd: [37.44, 129.17], segmentMid: [37.22, 129.31],
    nearKm: 45, detourKm: 45, detourMinutes: 38,
    viaPoints: [{ lat: 36.99, lng: 129.40, name: '울진' }, { lat: 37.44, lng: 129.17, name: '삼척' }],
  },
  {
    id: 'r7-samcheok-gangneung',
    roadNumber: '7', roadType: 'national',
    scenicType: 'coastal', stars: 5,
    name: '동해안 삼척~강릉',
    roadLabel: '국도 7호선 삼척~강릉',
    emoji: '🌊',
    description: '맹방해변·장호항·정동진·경포대로 이어지는 동해안의 하이라이트 구간. 바다가 도로 바로 옆이다.',
    segmentStart: [37.44, 129.17], segmentEnd: [37.75, 128.88], segmentMid: [37.60, 129.05],
    nearKm: 50, detourKm: 50, detourMinutes: 42,
    viaPoints: [{ lat: 37.58, lng: 129.12, name: '정동진' }, { lat: 37.75, lng: 128.88, name: '강릉 경포대' }],
  },
  {
    id: 'r7-gangneung-sokcho',
    roadNumber: '7', roadType: 'national',
    scenicType: 'coastal', stars: 5,
    name: '동해안 강릉~속초',
    roadLabel: '국도 7호선 강릉~속초',
    emoji: '🌊',
    description: '주문진·낙산사·속초를 잇는 동해안 최고 드라이브 코스. 파도와 소나무숲이 번갈아 등장한다.',
    segmentStart: [37.75, 128.88], segmentEnd: [38.21, 128.59], segmentMid: [37.98, 128.74],
    nearKm: 50, detourKm: 55, detourMinutes: 45,
    viaPoints: [{ lat: 37.90, lng: 128.79, name: '낙산사' }, { lat: 38.21, lng: 128.59, name: '속초' }],
  },
  {
    id: 'r7-sokcho-goseong',
    roadNumber: '7', roadType: 'national',
    scenicType: 'coastal', stars: 5,
    name: '동해안 속초~고성 화진포',
    roadLabel: '국도 7호선 속초~고성',
    emoji: '🌊',
    description: '청간정·화진포·통일전망대로 이어지는 최북단 동해안. 석호와 동해가 어우러진 절경이다.',
    segmentStart: [38.21, 128.59], segmentEnd: [38.60, 128.40], segmentMid: [38.41, 128.49],
    nearKm: 50, detourKm: 55, detourMinutes: 45,
    viaPoints: [{ lat: 38.38, lng: 128.47, name: '화진포' }, { lat: 38.60, lng: 128.40, name: '고성 통일전망대' }],
  },

  // ── 동해안 국도 14호선 (부산~울산) ────────────
  {
    id: 'r14-busan-gijang-ulsan',
    roadNumber: '14', roadType: 'national',
    scenicType: 'coastal', stars: 3,
    name: '부산 기장~울산 해안',
    roadLabel: '국도 14호선 기장~울산 강동',
    emoji: '🌊',
    description: '기장 대변항에서 울산 강동까지 바위해안과 어촌을 끼고 달리는 동남해안 드라이브.',
    segmentStart: [35.24, 129.21], segmentEnd: [35.55, 129.42], segmentMid: [35.40, 129.32],
    nearKm: 35, detourKm: 25, detourMinutes: 22,
    viaPoints: [{ lat: 35.24, lng: 129.21, name: '기장 대변항' }, { lat: 35.55, lng: 129.42, name: '울산 강동' }],
  },

  // ── 동해 고속도로 65호선 (부산~강릉) ──────────
  {
    id: 'ex65-ulsan-uljin',
    roadNumber: '65', roadType: 'expressway',
    scenicType: 'coastal', stars: 4,
    name: '동해고속도로 울산~울진',
    roadLabel: '고속도로 65호선 울산~울진',
    emoji: '🌊',
    description: '동해를 바로 옆에 끼고 달리는 동해안 고속도로. 터널과 교량이 연속되며 바다 전망이 탁월하다.',
    segmentStart: [35.55, 129.42], segmentEnd: [36.99, 129.40], segmentMid: [36.27, 129.41],
    nearKm: 55, detourKm: 50, detourMinutes: 35,
    viaPoints: [{ lat: 36.02, lng: 129.41, name: '포항 동해안' }, { lat: 36.99, lng: 129.40, name: '울진' }],
  },
  {
    id: 'ex65-uljin-gangneung',
    roadNumber: '65', roadType: 'expressway',
    scenicType: 'coastal', stars: 5,
    name: '동해고속도로 울진~강릉',
    roadLabel: '고속도로 65호선 울진~강릉',
    emoji: '🌊',
    description: '삼척·동해·강릉 구간. 동해고속도로에서 가장 아름다운 해안 절경이 펼쳐지는 구간이다.',
    segmentStart: [36.99, 129.40], segmentEnd: [37.75, 128.88], segmentMid: [37.37, 129.18],
    nearKm: 55, detourKm: 55, detourMinutes: 38,
    viaPoints: [{ lat: 37.44, lng: 129.17, name: '삼척' }, { lat: 37.75, lng: 128.88, name: '강릉' }],
  },

  // ── 남해안 국도 77호선 ────────────────────────
  {
    id: 'r77-geoje-tongyeong',
    roadNumber: '77', roadType: 'national',
    scenicType: 'coastal', stars: 5,
    name: '남해 거제~통영 한려수도',
    roadLabel: '국도 77호선 거제~통영',
    emoji: '🌊',
    description: '한려해상국립공원 핵심 구간. 거제 해금강·통영 미륵산 케이블카 일대의 다도해가 압권이다.',
    segmentStart: [34.88, 128.62], segmentEnd: [34.85, 128.42], segmentMid: [34.87, 128.52],
    nearKm: 45, detourKm: 40, detourMinutes: 35,
    viaPoints: [{ lat: 34.88, lng: 128.62, name: '거제 해금강' }, { lat: 34.85, lng: 128.42, name: '통영' }],
  },
  {
    id: 'r77-tongyeong-namhae',
    roadNumber: '77', roadType: 'national',
    scenicType: 'coastal', stars: 4,
    name: '남해 통영~남해도',
    roadLabel: '국도 77호선 통영~남해',
    emoji: '🌊',
    description: '창선·삼천포대교를 건너 남해도로 들어서는 구간. 다리와 섬이 어우러진 남해 특유의 경관.',
    segmentStart: [34.85, 128.42], segmentEnd: [34.84, 127.89], segmentMid: [34.85, 128.15],
    nearKm: 45, detourKm: 45, detourMinutes: 38,
    viaPoints: [{ lat: 34.91, lng: 128.06, name: '창선·삼천포대교' }, { lat: 34.84, lng: 127.89, name: '남해도' }],
  },
  {
    id: 'r77-taean-coast',
    roadNumber: '77', roadType: 'national',
    scenicType: 'coastal', stars: 4,
    name: '서해안 태안반도 해안',
    roadLabel: '국도 77호선 태안반도',
    emoji: '🌅',
    description: '리아스식 해안과 낙조가 아름다운 태안반도. 만리포·천리포·꽃지해안이 연속된다.',
    segmentStart: [36.85, 126.30], segmentEnd: [36.50, 126.28], segmentMid: [36.70, 126.15],
    nearKm: 45, detourKm: 40, detourMinutes: 35,
    viaPoints: [{ lat: 36.82, lng: 126.14, name: '만리포' }, { lat: 36.57, lng: 126.30, name: '꽃지해안' }],
  },
  {
    id: 'r77-boryeong-seocheon',
    roadNumber: '77', roadType: 'national',
    scenicType: 'coastal', stars: 3,
    name: '서해안 보령~서천 해안',
    roadLabel: '국도 77호선 보령~서천',
    emoji: '🌅',
    description: '대천해수욕장과 서해 머드축제로 유명한 보령·서천 서해안 구간.',
    segmentStart: [36.33, 126.56], segmentEnd: [36.07, 126.69], segmentMid: [36.20, 126.62],
    nearKm: 40, detourKm: 30, detourMinutes: 25,
    viaPoints: [{ lat: 36.33, lng: 126.56, name: '대천해수욕장' }, { lat: 36.07, lng: 126.69, name: '서천' }],
  },

  // ── 남해 국도 2호선 ───────────────────────────
  {
    id: 'r2-yeosu-coast',
    roadNumber: '2', roadType: 'national',
    scenicType: 'coastal', stars: 4,
    name: '여수 돌산 해안도로',
    roadLabel: '국도 2호선 여수~돌산',
    emoji: '🌊',
    description: '여수 돌산도를 일주하는 남해 해안도로. 향일암 일출과 섬 해안선이 아름답다.',
    segmentStart: [34.72, 127.78], segmentEnd: [34.65, 127.86], segmentMid: [34.69, 127.82],
    nearKm: 40, detourKm: 28, detourMinutes: 24,
    viaPoints: [{ lat: 34.69, lng: 127.82, name: '여수 향일암' }],
  },

  // ── 남해고속도로 10호선 ────────────────────────
  {
    id: 'ex10-suncheon-jinju',
    roadNumber: '10', roadType: 'expressway',
    scenicType: 'coastal', stars: 3,
    name: '남해고속도로 순천~진주',
    roadLabel: '고속도로 10호선 순천~진주',
    emoji: '🌊',
    description: '사천·삼천포IC 부근에서 남해안 조망이 열리는 구간. 고성 공룡화석지도 인근이다.',
    segmentStart: [34.95, 127.49], segmentEnd: [35.18, 128.08], segmentMid: [35.07, 127.79],
    nearKm: 40, detourKm: 35, detourMinutes: 25,
    viaPoints: [{ lat: 34.91, lng: 128.06, name: '사천·삼천포' }],
  },

  // ══════════════════════════════════════════════
  //  ⛰️  산악도로 구간
  // ══════════════════════════════════════════════

  // ── 국도 44호선 (설악산) ──────────────────────
  {
    id: 'r44-miseryeong',
    roadNumber: '44', roadType: 'national',
    scenicType: 'mountain', stars: 5,
    name: '미시령 고갯길',
    roadLabel: '국도 44호선 인제~속초 미시령',
    emoji: '⛰️',
    description: '설악산 서쪽을 넘는 고갯길. 꼬불꼬불한 구간에서 울산바위·대청봉·동해가 한눈에 펼쳐진다.',
    segmentStart: [38.07, 128.46], segmentEnd: [38.14, 128.47], segmentMid: [38.09, 128.42],
    nearKm: 35, detourKm: 15, detourMinutes: 20,
    viaPoints: [{ lat: 38.09, lng: 128.38, name: '미시령 정상' }],
  },
  {
    id: 'r44-hangyeryeong',
    roadNumber: '44', roadType: 'national',
    scenicType: 'mountain', stars: 5,
    name: '한계령',
    roadLabel: '국도 44호선 인제~양양 한계령',
    emoji: '⛰️',
    description: '설악산 남쪽 고개. 단풍철 전국 최고의 드라이브 코스로 꼽히며, 동해와 내설악이 동시에 보인다.',
    segmentStart: [37.97, 128.31], segmentEnd: [38.00, 128.48], segmentMid: [37.97, 128.41],
    nearKm: 35, detourKm: 18, detourMinutes: 22,
    viaPoints: [{ lat: 37.97, lng: 128.42, name: '한계령 정상' }],
  },

  // ── 국도 46호선 (진부령·비수구미) ─────────────
  {
    id: 'r46-jinburyeong',
    roadNumber: '46', roadType: 'national',
    scenicType: 'mountain', stars: 4,
    name: '진부령',
    roadLabel: '국도 46호선 인제~고성 진부령',
    emoji: '⛰️',
    description: '설악산 북쪽 고개. 겨울 설경이 아름답고 미시령보다 교통량이 적어 여유있는 산악 드라이브가 가능하다.',
    segmentStart: [38.19, 128.39], segmentEnd: [38.30, 128.44], segmentMid: [38.24, 128.40],
    nearKm: 35, detourKm: 22, detourMinutes: 22,
    viaPoints: [{ lat: 38.24, lng: 128.40, name: '진부령 정상' }],
  },
  {
    id: 'r46-bisu-paro',
    roadNumber: '46', roadType: 'national',
    scenicType: 'mountain', stars: 4,
    name: '파로호·비수구미 계곡',
    roadLabel: '국도 46호선 화천~양구 파로호',
    emoji: '⛰️',
    description: '파로호 수변과 비수구미 계곡을 끼고 달리는 오지 드라이브. 인적이 드물어 원시자연이 살아있다.',
    segmentStart: [38.10, 127.75], segmentEnd: [38.30, 127.90], segmentMid: [38.20, 127.83],
    nearKm: 40, detourKm: 35, detourMinutes: 30,
    viaPoints: [{ lat: 38.20, lng: 127.80, name: '파로호' }],
  },

  // ── 국도 6호선·56호선 (대관령) ─────────────────
  {
    id: 'r6-daegwallyeong',
    roadNumber: '6', roadType: 'national',
    scenicType: 'mountain', stars: 4,
    name: '대관령 옛길',
    roadLabel: '국도 6호선 평창~강릉 대관령',
    emoji: '⛰️',
    description: '영동과 영서를 가르는 대관령 99굽이. 정상에서 강릉 시내와 동해를 내려다보는 조망이 최고다.',
    segmentStart: [37.69, 128.72], segmentEnd: [37.78, 128.82], segmentMid: [37.73, 128.77],
    nearKm: 40, detourKm: 12, detourMinutes: 18,
    viaPoints: [{ lat: 37.69, lng: 128.72, name: '대관령 정상' }],
  },

  // ── 국도 5호선 (죽령·소백산) ──────────────────
  {
    id: 'r5-jukryeong',
    roadNumber: '5', roadType: 'national',
    scenicType: 'mountain', stars: 4,
    name: '소백산 죽령',
    roadLabel: '국도 5호선 단양~영주 죽령',
    emoji: '⛰️',
    description: '소백산을 넘는 역사적인 고갯길. 단풍과 철쭉 군락이 유명하며 고개 위 소백산 트레일과 연결된다.',
    segmentStart: [36.88, 128.48], segmentEnd: [36.95, 128.62], segmentMid: [36.88, 128.56],
    nearKm: 38, detourKm: 20, detourMinutes: 22,
    viaPoints: [{ lat: 36.88, lng: 128.56, name: '죽령 고개' }],
  },

  // ── 국도 35호선 (불영계곡) ─────────────────────
  {
    id: 'r35-bulyeong',
    roadNumber: '35', roadType: 'national',
    scenicType: 'mountain', stars: 5,
    name: '불영계곡 협곡도로',
    roadLabel: '국도 35호선 울진~봉화 불영계곡',
    emoji: '⛰️',
    description: '수십 km에 걸쳐 이어지는 깊은 협곡 도로. 에메랄드빛 소와 기암절벽이 연속되는 국내 최고의 계곡 드라이브.',
    segmentStart: [36.88, 129.25], segmentEnd: [36.68, 129.05], segmentMid: [36.78, 129.15],
    nearKm: 40, detourKm: 38, detourMinutes: 32,
    viaPoints: [{ lat: 36.88, lng: 129.25, name: '불영사계곡 입구' }, { lat: 36.68, lng: 129.05, name: '봉화' }],
  },

  // ── 국도 38호선 (만항재) ──────────────────────
  {
    id: 'r38-manhangje',
    roadNumber: '38', roadType: 'national',
    scenicType: 'mountain', stars: 5,
    name: '만항재',
    roadLabel: '국도 38호선 태백~정선 만항재',
    emoji: '⛰️',
    description: '해발 1,330m, 포장도로 기준 한국 최고 고개. 운해와 야생화 군락, 밤하늘 별이 장관이다.',
    segmentStart: [37.13, 128.96], segmentEnd: [37.30, 128.78], segmentMid: [37.20, 128.88],
    nearKm: 40, detourKm: 25, detourMinutes: 28,
    viaPoints: [{ lat: 37.20, lng: 128.88, name: '만항재 정상(1,330m)' }],
  },

  // ── 국도 31호선 (백두대간 영월~태백) ──────────
  {
    id: 'r31-youngwol-taebaek',
    roadNumber: '31', roadType: 'national',
    scenicType: 'mountain', stars: 3,
    name: '백두대간 영월~태백',
    roadLabel: '국도 31호선 영월~태백',
    emoji: '⛰️',
    description: '백두대간 서쪽 사면을 타는 산악 국도. 동강 전망과 함께 태백 탄광 역사 경관도 볼 수 있다.',
    segmentStart: [37.18, 128.46], segmentEnd: [37.17, 128.98], segmentMid: [37.18, 128.72],
    nearKm: 40, detourKm: 35, detourMinutes: 30,
    viaPoints: [{ lat: 37.18, lng: 128.46, name: '영월' }, { lat: 37.17, lng: 128.98, name: '태백' }],
  },

  // ── 국도 19호선 (지리산) ──────────────────────
  {
    id: 'r19-jirisan',
    roadNumber: '19', roadType: 'national',
    scenicType: 'mountain', stars: 4,
    name: '지리산 산악도로 구례~함양',
    roadLabel: '국도 19호선 구례~함양',
    emoji: '⛰️',
    description: '지리산 주능선 아래를 따라 달리는 코스. 성삼재·노고단 전망과 지리산 계곡이 연속된다.',
    segmentStart: [35.28, 127.47], segmentEnd: [35.45, 127.72], segmentMid: [35.35, 127.60],
    nearKm: 42, detourKm: 35, detourMinutes: 30,
    viaPoints: [{ lat: 35.28, lng: 127.47, name: '구례 성삼재' }, { lat: 35.45, lng: 127.72, name: '함양 마천' }],
  },

  // ── 국도 59호선 (지리산 동편) ─────────────────
  {
    id: 'r59-jirisan-east',
    roadNumber: '59', roadType: 'national',
    scenicType: 'mountain', stars: 3,
    name: '지리산 동편 산청~함양',
    roadLabel: '국도 59호선 산청~함양',
    emoji: '⛰️',
    description: '지리산 동쪽 능선과 남강 상류를 끼고 달리는 산악도로. 지리산 천왕봉 방면 조망이 열린다.',
    segmentStart: [35.27, 127.88], segmentEnd: [35.44, 127.68], segmentMid: [35.35, 127.78],
    nearKm: 38, detourKm: 28, detourMinutes: 24,
    viaPoints: [{ lat: 35.35, lng: 127.78, name: '지리산 동편 산청' }],
  },

  // ── 국도 416호선 (해산령·양구) ────────────────
  {
    id: 'r46-haesanryeong',
    roadNumber: '416', roadType: 'national',
    scenicType: 'mountain', stars: 4,
    name: '해산령·양구 비경',
    roadLabel: '국도 416호선 인제~양구 해산령',
    emoji: '⛰️',
    description: '해산령을 넘어 양구로 드는 오지 산악도로. 파로호 전경과 원시림이 압도적이다.',
    segmentStart: [38.10, 128.11], segmentEnd: [38.20, 127.95], segmentMid: [38.15, 128.03],
    nearKm: 38, detourKm: 30, detourMinutes: 28,
    viaPoints: [{ lat: 38.13, lng: 128.03, name: '해산령 정상' }],
  },
]

// 감지 우선순위: stars 높은 순 → detourMinutes 낮은 순
export const SCENIC_SEGMENTS_SORTED = [...SCENIC_SEGMENTS].sort(
  (a, b) => b.stars - a.stars || a.detourMinutes - b.detourMinutes
)
