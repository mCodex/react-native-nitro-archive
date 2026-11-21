require "json"
package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "react-native-nitro-archive"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]
  s.platforms    = { :ios => "15.5", :tvos => "15.4" }
  s.source       = { :git => "https://github.com/mcodex/react-native-nitro-archive.git", :tag => "#{s.version}" }
  s.module_name  = "NitroArchive"
  s.source_files = ["ios/**/*.{h,hpp,cpp,mm,swift}", "rust/include/nitro_archive_core.h"]
  s.public_header_files = "rust/include/nitro_archive_core.h"
  s.vendored_frameworks = "rust/artifacts/ios/NitroArchiveCore.xcframework"
  load 'nitrogen/generated/ios/NitroArchive+autolinking.rb'
  add_nitrogen_files(s)
end
