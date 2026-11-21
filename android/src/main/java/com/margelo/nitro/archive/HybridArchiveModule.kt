package com.margelo.nitro.archive

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip

// Nitrogen resolves autolinked implementations inside its generated package.
@Keep
@DoNotStrip
class HybridArchiveModule : dev.modex.nitroarchive.HybridArchiveModule()
