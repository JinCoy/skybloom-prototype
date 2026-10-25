/* Skybloom Firebase settings (step 12). These values are public by design: the data is guarded by firestore.rules, not by hiding them.
   auth.js uses the server only on the domains below (the ones authorised in Firebase Authentication); anywhere else
   (claude.ai shared pages, file://, the app build until native sign-in exists) the game runs device-only, as before. */
window.SKY_FIREBASE = {
  config: {
    apiKey: 'AIzaSyBzTKjaMvcWxZG5OGMejm3M-dJ1NJtAWC8',
    authDomain: 'skybloom-31d98.firebaseapp.com',
    projectId: 'skybloom-31d98',
    storageBucket: 'skybloom-31d98.firebasestorage.app',
    messagingSenderId: '869772761014',
    appId: '1:869772761014:web:76d60f322f91f06bea9317',
    measurementId: 'G-YVZYFSPTXM',
  },
  domains: ['jincoy.github.io', 'localhost', '127.0.0.1'],
  apple: true,   // Sign in with Apple (Firebase Apple provider on; Apple Developer Service ID com.dreamhum.skybloom.signin)
};
