// 기능 A 로직
/*
const FeatureA = {
    programId: $u.page.getPROGRAM_ID(),

    saveSnapshot: async () => {
        // 1. 기능 A에 종속된 데이터 수집
        const myData = {
            type: 'FeatureA_Type', // 구분용 (선택)
            os_data: $u.getValues(),
            ot_data: $u.gridWrapper.getGrid().getJSONData()
        };

        // 2. 공통 모듈 호출
        try {
            await LocalDBManager.add(this.programId, myData);
            alert('기능 A 데이터 저장 완료!');
        } catch (e) {
            console.error(e);
        }
    },

    loadSnapshots: async () => {
        const list = await LocalDBManager.getListByProgramId(this.programId);
        console.log('기능 A 목록:', list);
    }
};*/

/**
 * @namespace savaLode
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
    name: 'manualSaveLoad',
    description: 'unidocu5 plugin',
    extraModules: []
};
let $plugin;

$u.plugins.addPlugin(config.name, {
    config: config,
    init: (pluginHandlers) => {
        $plugin.addCustomHook(pluginHandlers);
    }
});

$plugin = {
    test: () => {
        const DB_NAME = 'AppSnapshotDB'; // 이름을 범용적으로 변경
        const STORE_NAME = 'snapshots';
        const VERSION = 1;
    }
};

$plugin.util = {};

$plugin.addCustomHook = (pluginHandlers) => {
    pluginHandlers.test = () => {};
};

const LocalDBManager = (function () {
    const DB_NAME = 'AppSnapshotDB'; // 이름을 범용적으로 변경
    const STORE_NAME = 'snapshots';
    const VERSION = 1;

    // 내부 전용함수: DB 열기
    const _openDB = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    // keyPath는 유지하되, 어떤 데이터든 담을 수 있게 설계
                    const store = db.createObjectStore(STORE_NAME, {keyPath: 'capture_key'});
                    // programId를 범용적인 'groupId'로 생각하고 인덱스 생성
                    store.createIndex('programId', 'programId', {unique: false});
                }
            };

            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
    };

    return {
        // 조회: 특정 프로그램(기능) ID로 조회
        getListByProgramId: async (programId) => {
            const db = await _openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const index = store.index('programId');
                const request = index.getAll(programId);

                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        },

        // 저장: 데이터 payload를 외부에서 받음 (가s장 중요한 변경점!)
        add: async (programId, payloadData) => {
            const db = await _openDB();

            // 키 생성 로직은 모듈이 담당하거나, 외부에서 받아도 됨 (여기선 모듈이 담당)
            const capture_key = 'key_' + new Date().getTime();

            // 저장할 객체 조립
            const newData = {
                programId: programId, // 인덱싱용 ID
                capture_key: capture_key, // PK
                capture_time: new Date().toLocaleString(), // 시간 포맷은 필요 시 조정
                ...payloadData // 외부에서 넘겨준 데이터 전개 (A기능, B기능 데이터 다 들어감)
            };

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.add(newData);

                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        },

        // 삭제
        deleteItems: async (keys) => {
            if (!keys || keys.length === 0) return;
            const db = await _openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);

                keys.forEach((key) => store.delete(key));

                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => reject(transaction.error);
            });
        }
    };
})();
