pipeline {
    // 윈도우 도커 바인드마운트 워크스페이스는 npm 소파일 I/O가 극악
    //  → 도커 네이티브 볼륨(jenkins_home) 하위 경로에서 빌드 (Job마다 경로 분리)
    agent {
        node {
            label ''
            customWorkspace '/var/jenkins_home/fast_workspace/plugin-checkpoint'
        }
    }

    // Node 없는 jdk 이미지라 NodeJS 도구 필요:
    //   Manage Jenkins > Tools > NodeJS 에 'node20' 이름으로 설치 등록
    tools { nodejs 'node20' }

    // GitHub 웹훅(인바운드) 불가 → 폴링(아웃바운드)으로 변경 감지
    triggers { pollSCM('H/5 * * * *') }

    environment {
        PLUGIN_ID = 'checkpoint'          // 설치 경로/파일명 기준 (어댑터 등록명)
        VERSION   = '1.0.0'
        NAS_DIR   = '/upload/plugins'      // Jenkins 컨테이너에 마운트된 NAS 경로
    }

    stages {
        stage('Install & Build') {
            steps {
                sh 'npm ci'
                sh 'npm run build'         // webpack → dist/plugin.js
            }
        }
        stage('Package & Deploy to NAS') {
            steps {
                // zip 대신 jar(=zip 포맷, JDK 기본 제공)로 패키징. cfM = 매니페스트 없이 plugin.js 만
                sh '''
                    mkdir -p "${NAS_DIR}"
                    cd dist && jar cfM "../${PLUGIN_ID}-${VERSION}.zip" plugin.js && cd ..
                    cp "${PLUGIN_ID}-${VERSION}.zip" "${NAS_DIR}/"
                    echo "배포 완료: ${NAS_DIR}/${PLUGIN_ID}-${VERSION}.zip"
                '''
            }
        }
    }
}
