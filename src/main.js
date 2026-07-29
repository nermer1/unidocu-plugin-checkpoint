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
let $plugin;

$u.plugins.addPlugin(config.name, {
    config: config,
    uiExtensions: {
        floatingActions: [
            {
                icon: 'fa fa-save',
                label: '저장 데이터',
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
    _keyHandler: async (e) => {
        const saveData = $plugin.localStorage();
        if (e.key === 'F2') {
            await saveData.set();
            const saveGrid = $u.gridWrapper.getGrid('save-dialog-grid');
            if (saveGrid) {
                const data = await saveData.get();
                saveGrid.setJSONData(data);
            }
        } else if (e.key === 'F4') {
            const data = await saveData.get();
            const manualData = data.filter((item) => item.capture_key.indexOf('_manual_') !== -1);
            const lastItem = manualData.length > 0 ? manualData[manualData.length - 1] : {};
            const {os_data = {}, ot_data = []} = lastItem;
            if (ot_data.length === 0) {
                document.removeEventListener('keyup', $plugin._keyHandler);
                unidocuAlert('텅', () => {
                    document.addEventListener('keyup', $plugin._keyHandler);
                    s;
                });
                return;
            }
            $u.setValues(os_data);
            $u.gridWrapper.getGrid().setJSONData(ot_data);
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
                const items = await db.getByPrefix(programId + '_');
                return items.map((item) => {
                    const isAuto = item.key === programId + '_auto';
                    return {
                        capture_key: item.key,
                        capture_type_name: isAuto ? '[자동 임시저장]' : '[수동 저장]',
                        capture_time: item.data.capture_time,
                        os_data: item.data.os_data,
                        ot_data: item.data.ot_data
                    };
                });
            },
            set: async (type = 'manual') => {
                const capture_key = type === 'auto' ? programId + '_auto' : programId + '_' + type + '_' + new Date().getTime();
                const capture_time = $plugin.util.getDatetoString();
                const os_data = $u.getValues() || {};
                let ot_data = [];
                try {
                    const grid = $u.gridWrapper.getGrid();
                    if (grid) ot_data = grid.getJSONData() || [];
                } catch (e) {}

                const db = await getDB();
                return db.save(capture_key, {
                    type,
                    capture_time,
                    os_data,
                    ot_data
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
            title: '안녕',
            buttons: buttons,
            textAlign: 'center',
            width: '700',
            draggable: true,
            resizable: true
        });
        const $dialog = instance.open();
        $dialog.append(
            '<div style="font-size:12px; color: red; text-align: left;">해당 기능은 ADMIN만 가능, 예산 조회 가능한 화면만 적용, 불러올 때 이벤트 등은 미적용</br>단축키 F2: 빠른 저장, F4: 빠른 불러오기</div>'
        );
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
                        const {os_data, ot_data} = targetItem;
                        $u.setValues(os_data);
                        $u.gridWrapper.getGrid().setJSONData(ot_data);
                        $dialog.dialog('close');
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
        const saveData = $plugin.localStorage();

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

        function addButtonAndEventListener() {
            if ($('#inputDataSave').length > 0) return; // 이미 추가되어 있으면 중복 방지

            const btn = $u.buttons.getSingleButtonsEl({
                BUTTON_ID: 'inputDataSave',
                TEXT: '저장 데이터',
                COLOR: 'blue'
            });
            btn.on('click', $plugin.openDialog);
            $('.unidocu-panel-ctrls').first().prepend(btn);
            //$('body').find('.page_title').append(btn);
        }

        function addKeypressEventListener() {
            document.removeEventListener('keyup', $plugin._keyHandler);
            document.addEventListener('keyup', $plugin._keyHandler);
        }

        // 매 렌더링 시 버튼 존재 여부를 확인하고 추가
        //addButtonAndEventListener();

        // 최초 1회만 초기화할 로직 (웹데이터, 단축키)
        if (!$plugin._isSaveLoadOneTimeInit) {
            $plugin._isSaveLoadOneTimeInit = true;
            setWebData();
            addKeypressEventListener();
        }
    },
    getProgramSettingData: () => {
        const buttonData = $u.webData.programSetting.getData('UD_0601_070')['popupButtonData'] || {};
        const programId = $u.page.getPROGRAM_ID();
        return buttonData[programId];
    },
    addButtonAndHandler: () => {
        const currentData = $plugin.getProgramSettingData();
        if (currentData) {
            const {os_data, buttonIndex, isMass, scope} = currentData;
            const $buttonEl = $u.buttons.getSingleButtonsEl(os_data);
            const scopeName = `#${scope || 'uni-buttons'}`;
            const $buttons = $(scopeName);

            if (buttonIndex > 1) {
                $buttonEl.insertBefore($buttons.find('button').eq(buttonIndex - 1));
            } else {
                $buttonEl.appendTo($buttons);
            }

            $u.buttons.getHandler().budgetInquiry = () => {
                const budat = !isMass && $u.get('BUDAT') ? $u.get('BUDAT').getValue() : $u.util.date.getCurrentDateAsDataFormat();
                $u.popup.openByProgramId('UD_0601_070', 1280, 800, {isMass, budat});
            };
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

let isAutoSavePrompted = false;

$plugin.addCustomHook = (pluginHandlers) => {
    pluginHandlers.onSystemError = (error) => {
        const os_data = $u.getValues() || {};
        let ot_data = [];
        try {
            const grid = $u.gridWrapper.getGrid();
            if (grid) ot_data = grid.getJSONData() || [];
        } catch (e) {}

        // 데이터가 아예 없는 빈 화면이면 무시
        if (Object.keys(os_data).length === 0 && ot_data.length === 0) return;

        $plugin.localStorage().set('auto');
    };

    pluginHandlers.afterRenderUIComponents = ($scope, subGroup) => {
        // 매 렌더링 시 버튼 유무를 확인하여 버튼을 추가
        $plugin.initSaveLoadEvents();

        const saveData = $plugin.localStorage();
        saveData.get().then((data) => {
            const autoSaveDataList = data.filter((item) => item.capture_key === $u.page.getPROGRAM_ID() + '_auto');
            if (autoSaveDataList.length > 0) {
                const latestAutoSave = autoSaveDataList[0]; // 제일 최신 내역 (단일 슬롯)

                unidocuConfirm(
                    '비정상 종료로 인해 임시 저장된 데이터가 있습니다. 복구하시겠습니까?',
                    () => {
                        const {os_data, ot_data} = latestAutoSave;
                        if (os_data && Object.keys(os_data).length > 0) $u.setValues(os_data);
                        if (ot_data && ot_data.length > 0) {
                            try {
                                const grid = $u.gridWrapper.getGrid();
                                if (grid) grid.setJSONData(ot_data);
                            } catch (e) {}
                        }
                        saveData.clear(autoSaveDataList).then(() => {
                            unidocuAlert('데이터 복구 완료 및 임시 내역이 삭제되었습니다.');
                        });
                    },
                    () => {
                        // 아니오 누르면 자동 저장 내역을 지우지 않고 다이얼로그에 유지함
                    }
                );
            }
        });
    };
};
