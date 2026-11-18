// Brand marks on the sign-in buttons that are files rather than code.
//
// Google's "G" is Google's artwork and is never redrawn here. The files are
// byte-for-byte copies of the mark Google ships inside its own Sign-In SDK
// for exactly this button (`ios/Pods/GoogleSignIn/GoogleSignIn/Sources/
// Resources/google{,@2x,@3x}.png`, 18 pt) — replace them only with another
// official asset from Google's sign-in branding page.
import type {ImageSourcePropType} from 'react-native';

export const GOOGLE_MARK: ImageSourcePropType = require('../../assets/img/icons/google-g.png');
