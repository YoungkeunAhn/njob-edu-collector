-- 1차 소스 16개. 정본: docs/06-스펙/plan.md 소스별 표, docs/03-데이터수집/소스별-수집가능성-목록.md
insert into source (code, name, kind, grp, license, attribution) values
  ('work24',         '고용24 훈련과정',              'html',     'A', null,        '고용24'),
  ('seoul-yeyak',    '서울 공공서비스예약 교육',      'api',      'A', '공공누리1', '서울 열린데이터광장'),
  ('daegu',          '대구 평생학습포털',             'api',      'A', null,        '대구광역시 평생학습포털'),
  ('kstartup',       'K-Startup 사업공고',            'api',      'A', null,        'K-Startup'),
  ('seoul-lifelong', '서울시평생학습포털',            'html',     'B', null,        '서울시평생학습포털'),
  ('sesac',          '청년취업사관학교 SeSAC',        'html',     'B', null,        'SeSAC'),
  ('jobaba',         '경기도일자리재단 잡아바',       'html',     'B', null,        '잡아바'),
  ('greenlove',      '주변애',                        'html',     'B', null,        '주변애'),
  ('dev-event',      '데브이벤트',                    'html',     'B', null,        'Dev-Event'),
  ('linkareer',      '링커리어 교육',                 'html',     'B', null,        '링커리어'),
  ('theteams',       '더팀스 활동',                   'html',     'B', null,        '더팀스'),
  ('somoim',         '소모임',                        'html',     'B', null,        '소모임'),
  ('digital-baeum',  'AI디지털배움터',                'headless', 'C', null,        'AI디지털배움터'),
  ('lifelong-std',   '전국평생학습강좌표준데이터',    'api',      'D', null,        '공공데이터포털'),
  ('kmooc',          'K-MOOC',                        'api',      'D', null,        'K-MOOC'),
  ('youthcenter',    '온통청년',                      'api',      'D', null,        '온통청년');
