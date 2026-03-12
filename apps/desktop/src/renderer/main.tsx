import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'

// Add platform class for macOS-specific CSS (traffic light padding etc.)
if (navigator.platform?.includes('Mac')) {
    document.body.classList.add('platform-darwin')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)
