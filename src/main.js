/**
 * @namespace checkpoint
 * @version 1.0.0
 *
 * 설명:
 *
 * 지원: 유니다큐5
 *
 * 사용법:
 *
 */
const config = {
    version: '1.0.0',
    name: 'checkpoint',
    description: 'unidocu5 plugin checkpoint',
    extraModules: []
};
// 저장 대상 판별에서 항상 제외할 기본 폼 영역(검색조건). config의 excludeFormAreaIds와 병합됨
const DEFAULT_EXCLUDE_FORM_AREA_IDS = ['search-condition'];
// 복구 후 change 이벤트를 태울 폼 필드 (프로그램ID별 기본값).
// change 핸들러가 DOM 추가/삭제나 그리드 재검색 같은 부작용을 일으킬 수 있어 전체 트리거는 위험 →
// 프로그램별로 안전한 필드만 명시. config의 changeTriggerFields[pid]와 병합됨.
//   - before: change가 DOM을 재구성하는 필드 → change 먼저 태우고 값 재적용 (예: PAYGB — 테이블 갈아엎음)
//   - after : 일반 필드 → 값 세팅 후 change (기본)
const DEFAULT_CHANGE_TRIGGER_FIELDS = {
    UD_0204_100: {before: ['PAYGB', 'EVIKB'], after: []}
};
let $plugin;

$u.plugins.addPlugin(config.name, {
    config: config,
    uiExtensions: {
        floatingActions: [
            {
                id: 'save', // config fab 오버라이드 키
                icon: 'fa fa-save',
                label: '저장 데이터',
                visible: () => {
                    return $plugin.isSaveTargetScreen();
                },
                onClick: () => {
                    if (typeof $plugin.openDialog === 'function') {
                        $plugin.openDialog();
                    }
                }
            }
        ]
    },
    init: (pluginHandlers) => {
        $plugin.addCustomHook(pluginHandlers);
    }
});

const customDialog = (function () {
    let instance;

    function initOptions(dialogOptions) {
        const defalutOptions = {
            title: '',
            message: '',
            width: '540',
            textAlign: 'center',
            textColor: ''
        };
        Object.keys(defalutOptions).map(function (key) {
            if (!dialogOptions[key]) dialogOptions[key] = defalutOptions[key];
        });
    }

    function templateDialog(dialogOptions) {
        initOptions(dialogOptions);
        const templateString = $u.util.formatString(
            '<div style="text-align:{textAlign}; color:{textColor}" class="unidocu-alert custom-dialog"><pre>{message}</pre></div>',
            dialogOptions
        );
        const $dialog = $(templateString);
        return $u.baseDialog.openModalDialog($dialog, dialogOptions);
    }

    function setInstance() {
        instance = {
            init: function (options) {
                this.options = {};
                this.options = options;
            },
            open: function () {
                return templateDialog(this.options);
            }
        };
    }

    return {
        getInstance() {
            if (!instance) setInstance();
            return instance;
        }
    };
})();

$plugin = {
    // config(extraPlugins) 옵션을 기본값과 병합해 반환
    getScreenOptions: () => {
        const opt = ($u.plugins.getOptions('checkpoint') || {}).saveTarget || {};
        return {
            forceEnableProgramIds: opt.forceEnableProgramIds || [], // config 그대로
            forceDisableProgramIds: opt.forceDisableProgramIds || [], // config 그대로
            excludeFormAreaIds: DEFAULT_EXCLUDE_FORM_AREA_IDS.concat(opt.excludeFormAreaIds || []) // 기본값 + config 병합
        };
    },
    // 복구 후 change 트리거할 폼 필드를 { before, after } 로 반환 (기본값 + config 병합)
    //  - 배열로 주면 전부 after 로 간주 (하위 호환)
    getChangeTriggerFields: (pid) => {
        const norm = (v) => (Array.isArray(v) ? {before: [], after: v.slice()} : {before: (v && v.before) || [], after: (v && v.after) || []});
        const d = norm(DEFAULT_CHANGE_TRIGGER_FIELDS[pid]);
        const c = norm((($u.plugins.getOptions('checkpoint') || {}).changeTriggerFields || {})[pid]);
        return {
            before: Array.from(new Set(d.before.concat(c.before))),
            after: Array.from(new Set(d.after.concat(c.after)))
        };
    },
    // 저장/로드 대상 화면인지 판별
    // 우선순위: forceDisable > forceEnable > 팝업 > 자동판별(그리드/폼)
    isSaveTargetScreen: () => {
        const tools = $u.plugins.tools;
        const opt = $plugin.getScreenOptions();
        const pid = $u.page.getPROGRAM_ID();

        if (!pid) return false; // 로그인 등 프로그램 없는 화면
        if (opt.forceDisableProgramIds.includes(pid)) return false; // ① 강제 제외 (최우선)
        if (opt.forceEnableProgramIds.includes(pid)) return true; // ② 강제 허용
        if ($u.isPopupView()) return false; // ③ 팝업으로 뜬 화면

        // ④ 자동 판별
        const $grids = $('.unidocu-grid');
        const $forms = $('.unidocu-form-table-wrapper');

        // 입력 영역(그리드/폼)이 아예 없으면 대상 아님
        if ($grids.length === 0 && $forms.length === 0) return false;

        // 편집 가능한 그리드가 하나라도 있으면 대상 (하나 걸리면 폼 검사 스킵)
        const gridEditable = $grids.toArray().some((el) => {
            if ($(el).data('subGroup') !== pid) return false; // 이 프로그램 소속 그리드만 (팝업/다이얼로그 제외)
            const gridObj = $u.gridWrapper.getGrid(el.id);
            return gridObj ? tools.isGridEditable(gridObj) : false;
        });
        if (gridEditable) return true;

        // 검색영역(excludeFormAreaIds) 제외한 wrapper 중 편집 가능(readOnly=false) 필드가 있으면 대상
        return $forms.toArray().some((el) => {
            const formId = el.id;
            if (!formId || opt.excludeFormAreaIds.includes(formId)) return false;
            const names = $u.getNames(formId) || [];
            return names.some((name) => {
                const field = $u.get(name);
                return field && !field.isReadOnly();
            });
        });
    },
    // 화면의 모든 그리드 데이터를 { subId: json } 으로 수집
    // 키는 안정 식별자인 subId(예: GRIDHEADER). DOM id(unidocu-grid 등)는 렌더 순서로 바뀌므로 사용 안 함.
    // subGroup === 현재 programId 인 그리드만 → 팝업/검색/저장다이얼로그 그리드 자동 제외
    // 하 솔루션 트리는 래핑 api롤 뭘 할 수가 없냐
    collectGrids: () => {
        const grids = {};
        const treeParams = {}; // 트리 그리드의 setTreeData 파라미터 (onSetTreeData 훅에서 캡처된 것)
        const pid = $u.page.getPROGRAM_ID();
        $('.unidocu-grid')
            .toArray()
            .forEach((el) => {
                const $el = $(el);
                if ($el.data('subGroup') !== pid) return; // 이 프로그램 소속 그리드만
                const subId = $el.data('subId');
                if (!subId) return;
                try {
                    const gridObj = $u.gridWrapper.getGrid(el.id); // 조회는 현재 DOM id로
                    if (!gridObj) return;
                    if (gridObj.rg.tree.isTreeMode()) {
                        // 트리: getJsonRows는 루트만 반환 → getDescendants로 자식까지 flat 전체 추출
                        // SELECTED 데이터는 stale(라디오 이전 선택이 1로 남음)할 수 있어, 실제 체크 상태(getCheckedRows)로 덮어씀
                        const dp = gridObj._rg.gridView.getDataProvider();
                        const gv = gridObj._rg.gridView;
                        const checked = new Set(gv.getCheckedRows ? gv.getCheckedRows() : []); // 실제 체크된 행 id (라디오면 1개)
                        grids[subId] = dp.getDescendants().map((rid) => {
                            const row = {...dp.getJsonRow(rid)}; // 라이브 데이터 오염 방지용 복사
                            row.SELECTED = checked.has(rid) ? '1' : '0';
                            return row;
                        });
                        if (gridObj._checkpointTreeParams) treeParams[subId] = gridObj._checkpointTreeParams;
                    } else {
                        grids[subId] = gridObj.getJSONData() || [];
                    }
                } catch (e) {}
            });
        return {grids, treeParams};
    },
    // subId로 현재 화면의 그리드 DOM 엘리먼트를 찾음 (없으면 null)
    findGridElBySubId: (subId) => {
        const pid = $u.page.getPROGRAM_ID();
        return (
            $('.unidocu-grid')
                .toArray()
                .find((el) => {
                    const $el = $(el);
                    return $el.data('subGroup') === pid && String($el.data('subId')) === String(subId);
                }) || null
        );
    },
    // 첨부 그룹키 조회 (fileUI 업로더 없으면 null)
    getAttachGroupId: () => {
        try {
            const uploader = $u.fileUI && $u.fileUI.getFineUploader && $u.fileUI.getFineUploader();
            return uploader ? uploader.getFileGroupId() : null;
        } catch (e) {
            return null;
        }
    },
    // 저장 항목을 화면에 복구.
    // 다이얼로그 이벤트 콜백 내에서 동기 실행하면 jQuery UI 포커스(_focusTabbable) 레이스가 나므로,
    // 한 틱 미뤄(다이얼로그 처리 종료 후) 실제 복구를 실행한다.
    restoreCapture: (item) => {
        return new Promise((resolve) => {
            if (!item) return resolve();
            setTimeout(() => {
                $plugin._restoreCaptureNow(item);
                resolve();
            }, 0);
        });
    },
    // 실제 복구 본문 (폼 + 다중 그리드; 레거시 단일 ot_data 폴백)
    _restoreCaptureNow: (item) => {
        if (!item) return;

        const grids = item.grids;
        const treeParams = item.treeParams || {};
        if (grids && Object.keys(grids).length > 0) {
            Object.keys(grids).forEach((subId) => {
                // subId로 현재 화면의 그리드를 찾아 복구 (DOM id는 불안정하므로 subId 기준 매칭)
                const el = $plugin.findGridElBySubId(subId);
                if (!el) return;
                try {
                    const gridObj = $u.gridWrapper.getGrid(el.id);
                    if (!gridObj) return;
                    const ot_data = grids[subId] || [];
                    const tp = treeParams[subId];
                    if (gridObj.rg.tree.isTreeMode() && tp) {
                        // 트리: 저장 파라미터로 setTreeData 재호출 → raw 데이터로 _H 재생성되어 계층 복원
                        gridObj.setTreeData(tp.treeColumn, ot_data, tp.parentKey, tp.currentKey, tp.rootValue);
                        // setTreeData 내부 checkItem이 flat 인덱스라 엉뚱한 행을 체크함
                        // → 전체 해제 후, data row id 기준으로 정확히 재체크 (중복 체크 방지)
                        const dp = gridObj._rg.gridView.getDataProvider();
                        const gv = gridObj._rg.gridView;
                        const allIds = dp.getDescendants();
                        const toCheck = allIds.filter((rid) => String(dp.getJsonRow(rid).SELECTED) === '1');
                        if (gv.checkRows) {
                            gv.checkRows(allIds, false); // 전체 해제
                            gv.checkRows(toCheck, true); // 실제 선택만
                        } else if (gv.checkRow) {
                            allIds.forEach((rid) => gv.checkRow(rid, false));
                            toCheck.forEach((rid) => gv.checkRow(rid, true));
                        }
                    } else {
                        gridObj.setJSONData(ot_data);
                    }
                } catch (e) {}
            });
        } else if (item.ot_data && item.ot_data.length > 0) {
            // 레거시(단일 그리드) 저장분 → 기본 그리드에 적용
            try {
                const gridObj = $u.gridWrapper.getGrid();
                if (gridObj) gridObj.setJSONData(item.ot_data);
            } catch (e) {}
        }

        const os_data = item.os_data || {};
        if (Object.keys(os_data).length > 0) {
            $u.setValues(os_data);
            const {before, after} = $plugin.getChangeTriggerFields($u.page.getPROGRAM_ID());
            if (before.length > 0) {
                $u.plugins.tools.triggerFieldChanges(before); // DOM 재구성류 change 먼저
                $u.setValues(os_data); // 재구성된 DOM에 값 재적용
            }
            if (after.length > 0) $u.plugins.tools.triggerFieldChanges(after);
        }

        // 첨부 그룹키 복구 (저장돼 있고 업로더가 있으면 재설정)
        if (item.attach) {
            try {
                const uploader = $u.fileUI && $u.fileUI.getFineUploader && $u.fileUI.getFineUploader();
                if (uploader) uploader.setFileGroupId(item.attach);
            } catch (e) {}
        }
    },
    localStorage: () => {
        const programId = $u.page.getPROGRAM_ID();
        let _db = null;

        const getDB = async () => {
            if (!_db) _db = await $u.plugins.tools.connectIndexedDB();
            return _db;
        };

        return {
            get: async () => {
                const db = await getDB();
                const all = await db.getAll();
                const autoKey = programId + '_auto';
                const manualPrefix = programId + '_manual_';
                // 현재 program 소속만 노출 — program_id 필드 우선, 레거시(필드 없는 기존 저장)는 구분자 안전 키 매칭으로 폴백
                const items = all.filter(
                    (item) => (item.data && item.data.program_id === programId) || item.key === autoKey || item.key.indexOf(manualPrefix) === 0
                );
                return items.map((item) => {
                    const isAuto = item.key === autoKey;
                    const d = item.data || {};
                    return {
                        capture_key: item.key,
                        capture_type_name: isAuto ? '[자동 임시저장]' : '[수동 저장]',
                        capture_time: d.capture_time,
                        os_data: d.os_data,
                        grids: d.grids || {},
                        treeParams: d.treeParams || {}, // 트리 그리드 복구용 파라미터
                        ot_data: d.ot_data, // 레거시 단일 그리드 (restoreCapture 폴백용)
                        attach: d.attach || null
                    };
                });
            },
            set: async (type = 'manual', pre) => {
                const capture_key = type === 'auto' ? programId + '_auto' : programId + '_' + type + '_' + new Date().getTime();
                const capture_time = $plugin.util.getDatetoString();
                // pre가 있으면 미리 수집한 데이터 재사용 (onSystemError에서 유무 판단 시 이미 수집한 것 등)
                const os_data = pre ? pre.os_data : $u.getValues() || {};
                const collected = pre || $plugin.collectGrids(); // {grids, treeParams}
                const grids = collected.grids;
                const treeParams = collected.treeParams;
                const attach = $plugin.getAttachGroupId(); // 첨부 그룹키 (없으면 null)

                const db = await getDB();
                return db.save(capture_key, {
                    program_id: programId, // 프로그램별 스코핑용 (get에서 정확 매칭)
                    type,
                    capture_time,
                    os_data,
                    grids,
                    treeParams,
                    attach
                });
            },
            clear: async (selectedItems) => {
                if (!selectedItems || selectedItems.length === 0) return;

                const db = await getDB();
                const keys = selectedItems.map((item) => item.capture_key);
                return db.removeByPrefix(keys);
            }
        };
    },
    openDialog: () => {
        const gridId = 'save-dialog-grid';
        const saveData = $plugin.localStorage();

        const buttons = [
            $u.baseDialog.getButton(
                '저장',
                () => {
                    saveData.set().then(setLoadData);
                },
                'unidocu-button blue'
            ),
            $u.baseDialog.getButton('저장 데이터 삭제', () => {
                const selectedData = gridObj.getSELECTEDJSONData();
                saveData.clear(selectedData).then(setLoadData);
            })
        ];
        const instance = customDialog.getInstance();
        instance.init({
            title: '',
            buttons: buttons,
            textAlign: 'center',
            width: '700',
            draggable: true,
            resizable: true
        });
        const $dialog = instance.open();
        /*$dialog.append(
            '<div style="font-size:12px; color: red; text-align: left;">해당 기능은 ADMIN만 가능, 불러올 때 이벤트 등은 미적용</div>'
        );*/
        $dialog.append(`<div id=${gridId} class="unidocu-grid" data-sub-group=${gridId} data-sub-id="GRIDHEADER" style="height: 170px;"></div>`);
        $u.renderUIComponents($dialog);

        const gridObj = $u.gridWrapper.getGrid(gridId);
        setLoadData();

        gridObj.onCellClick((columnKey, rowIndex) => {
            if (columnKey === 'capture_key') {
                unidocuConfirm('덮어씌울까요?', async () => {
                    const allData = await saveData.get();
                    const selectedKey = gridObj.$V(columnKey, rowIndex);
                    const targetItem = allData.find((item) => item[columnKey] === selectedKey);

                    if (targetItem) {
                        await saveData.clear([targetItem]);
                        $dialog.dialog('close'); // 저장 다이얼로그 닫기 (모달 제거)
                        $plugin.restoreCapture(targetItem); // 닫힌 뒤 복구 (내부 지연, 모달 없어 focus-trap 회피)
                    }
                });
            }
        });

        function setLoadData() {
            saveData.get().then((ot_data) => {
                gridObj.setJSONData(ot_data);
            });
        }
    },
    initSaveLoadEvents: () => {
        const gridId = 'save-dialog-grid';

        function setWebData() {
            $u.webData.customWebDataMap[`${gridId}@GRIDHEADER`] = {
                OS_DATA: {
                    IGN_GRID_PANEL: '1',
                    SELECTED_OPTIONS: 'C'
                },
                OT_DATA: [
                    {
                        FNAME: 'capture_type_name',
                        FNAME_TXT: '저장 구분',
                        WIDTH: '110'
                    },
                    {
                        FNAME: 'capture_key',
                        FNAME_TXT: '저장키',
                        TYPE: 'imagetext',
                        WIDTH: '150'
                    },
                    {
                        FNAME: 'capture_time',
                        FNAME_TXT: '저장시간',
                        WIDTH: '150'
                    }
                ]
            };
        }

        // 최초 1회만 초기화할 로직 (저장 다이얼로그 그리드 웹데이터)
        if (!$plugin._isSaveLoadOneTimeInit) {
            $plugin._isSaveLoadOneTimeInit = true;
            setWebData();
        }
    }
};

$plugin.util = {
    getDatetoString: (date = new Date()) => {
        const fillString = $plugin.util.fillString;
        const year = date.getFullYear();
        const month = fillString(date.getMonth() + 1);
        const day = fillString(date.getDate());
        const hours = fillString(date.getHours());
        const minutes = fillString(date.getMinutes());
        const seconds = fillString(date.getSeconds());

        return [year, month, day, hours, minutes, seconds].join('');
    },
    fillString: (str, len = 2, fill = '0', isStart = true) => {
        return str.toString()[isStart ? 'padStart' : 'padEnd'](len, fill);
    }
};

$plugin.addCustomHook = (pluginHandlers) => {
    // setTreeData 호출 시점의 트리 파라미터를 그리드에 캡처 (어댑터가 onSetTreeData 훅으로 넘겨줌)
    pluginHandlers.onSetTreeData = (gridObj, params) => {
        gridObj._checkpointTreeParams = params;
    };

    pluginHandlers.onSystemError = (error) => {
        if (!$plugin.isSaveTargetScreen()) return;
        const os_data = $u.getValues() || {};
        const {grids, treeParams} = $plugin.collectGrids();
        const hasGridData = Object.keys(grids).some((id) => (grids[id] || []).length > 0);

        // 데이터가 아예 없는 빈 화면이면 무시
        if (Object.keys(os_data).length === 0 && !hasGridData) return;

        $plugin.localStorage().set('auto', {os_data, grids, treeParams}); // 이미 수집한 데이터 재사용 (중복 수집 방지)
    };

    pluginHandlers.afterRenderUIComponents = ($scope, subGroup) => {
        // 버튼/웹데이터 세팅은 저장 대상 화면에서만
        if ($plugin.isSaveTargetScreen()) $plugin.initSaveLoadEvents();

        // 복구 프롬프트는 편집 판별(렌더 타이밍에 취약)과 분리 — 이 프로그램에 auto 데이터가 있으면 제안
        const pid = $u.page.getPROGRAM_ID();
        if (!pid) return;
        // 자동저장 복구 프롬프트는 '프로그램 진입당 1회'만.
        // 한 화면이 서브그룹/다이얼로그 등으로 renderUIComponents를 여러 번 호출해도 중복 알림 방지
        // (get()이 비동기라 마킹은 반드시 get 이전에 동기적으로 — 레이스로 2번 뜨던 문제 차단)
        // 프로그램이 실제로 바뀌면 다시 허용 → 재진입 시 복구 가능
        if ($plugin._autoPromptProgramId === pid) return;
        $plugin._autoPromptProgramId = pid;

        const saveData = $plugin.localStorage();
        saveData.get().then((data) => {
            const autoSaveDataList = data.filter((item) => item.capture_key === pid + '_auto');
            if (autoSaveDataList.length === 0) {
                // auto 없음 → 이 pid 마킹 해제 (이후 에러로 auto가 생기면 재렌더/재진입 시 다시 프롬프트)
                if ($plugin._autoPromptProgramId === pid) $plugin._autoPromptProgramId = null;
                return;
            }
            const latestAutoSave = autoSaveDataList[0]; // 제일 최신 내역 (단일 슬롯)

            unidocuConfirm(
                '비정상 종료로 인해 임시 저장된 데이터가 있습니다. 복구하시겠습니까?',
                () => {
                    // 확인 다이얼로그 닫힌 뒤 복구 (내부 지연, 모달 없어 focus-trap 회피)
                    saveData.clear(autoSaveDataList);
                    $plugin.restoreCapture(latestAutoSave);
                },
                () => {
                    // 아니오 누르면 자동 저장 내역을 지우지 않고 다이얼로그에 유지함
                }
            );
        });
    };
};
