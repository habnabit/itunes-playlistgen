import { Method } from 'axios'

export const postJSON = (data: any) => ({
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
})

export const axiosPostJson = (data: any) => ({
    method: 'post' as Method,
    headers: {
        'Content-Type': 'application/json',
    },
    data: JSON.stringify(data),
})
