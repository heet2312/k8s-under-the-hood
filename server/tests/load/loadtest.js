import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
    vus: 200,          // virtual users (adjusted for varied requests)
    duration: '5m',    // test duration
};

export default function () {
    const baseUrl = __ENV.API_URL || 'http://taskflow.local';
    const params = {
        headers: {
            'Host': __ENV.HEADERS_HOST || 'taskflow.local',
            'Content-Type': 'application/json',
        },
    };

    const random = Math.random();

    if (random < 0.40) {
        // 40% traffic: Fetch Workspaces
        http.get(`${baseUrl}/api/workspaces`, params);
    } else if (random < 0.70) {
        // 30% traffic: Fetch Tasks
        http.get(`${baseUrl}/api/tasks?project=6a213aa57af298e1ff01abf3`, params);
    } else if (random < 0.90) {
        // 20% traffic: Health Check
        http.get(`${baseUrl}/api/health`, params);
    } else {
        // 10% traffic: Create Workspace (generates POST write load)
        const payload = JSON.stringify({
            name: `LoadTest-Workspace-${__VU}-${__ITER}`,
        });
        http.post(`${baseUrl}/api/workspaces`, payload, params);
    }

    // Dynamic sleep to space out requests (average 1 second)
    sleep(Math.random() * 1.5 + 0.25);
}
