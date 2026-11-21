#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

extern NSErrorDomain const NitroArchiveZipEntryReaderErrorDomain;

@interface NitroArchiveZipEntryReader : NSObject

+ (BOOL)extractEntryAtPath:(NSString *)archivePath
                entryIndex:(NSUInteger)entryIndex
            destinationPath:(NSString *)destinationPath
                  password:(nullable NSString *)password
                     limit:(uint64_t)limit
              writtenBytes:(uint64_t *)writtenBytes
                     error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
