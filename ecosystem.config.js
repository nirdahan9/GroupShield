module.exports = {
    apps: [{
        name: 'groupshield',
        script: 'bot.js',
        max_memory_restart: '400M',
        restart_delay: 5000,
        max_restarts: 10,
        env: {
            FIREBASE_SECRET: 'xWBAVNtXEVDrFYHBGqzlDfA7j4QCMD9rl28cxy2J'
        }
    }]
};
