-- 잡아바·주변애·더팀스 다시 켬: Worker 대신 로컬 PC 가 수집한다(worker/scripts/collect-local.ts, 이슈 #2).
update source set enabled = true where code in ('jobaba', 'greenlove', 'theteams');
